import type { ContentData } from './types.js';
import type { EmbeddingResult } from '../embedding-service.js';

/**
 * @description Читает значение по dot-path (`foo.bar`) из payload/metadata.
 * Возвращает `undefined`, если цепочка не существует.
 * @param {Record<string, any> | undefined | null} source - Исходный объект.
 * @param {string} key - Ключ или dot-path.
 * @returns {unknown} Найденное значение или undefined.
 */
export function getNestedValue(
	source: Record<string, any> | undefined | null,
	key: string
): unknown {
	if (!source || !key) {
		return undefined;
	}

	return key.split('.').reduce<unknown>((acc, segment) => {
		if (
			acc &&
			typeof acc === 'object' &&
			segment in (acc as Record<string, any>)
		) {
			return (acc as Record<string, any>)[segment];
		}
		return undefined;
	}, source);
}

/**
 * @description Достаёт стабильный `originalId` из metadata, а если он не передан,
 * использует исходный id записи. Это позволяет держать отдельный point id для чанка
 * и при этом получать все чанки заметки через общий `originalId`.
 * @param {string} pointId - Стабильный id конкретной записи/чанка.
 * @param {Record<string, any>} metadata - Пользовательские метаданные.
 * @returns {string} `originalId` для группировки и baseline-запросов.
 */
export function extractOriginalId(
	pointId: string,
	metadata: Record<string, any> = {}
): string {
	const explicit = getNestedValue(metadata, 'originalId');
	return typeof explicit === 'string' && explicit.length > 0
		? explicit
		: pointId;
}

/**
 * @description Нормализует финальный payload semantic backend-а так, чтобы HTTP
 * ответы оставались совместимыми независимо от конкретного storage backend-а.
 * @param {ContentData} contentData - Пользовательские данные для индексации.
 * @param {string} contentHash - Хэш текущего текста для дедупликации.
 * @param {EmbeddingResult} embeddingResult - Данные о вычисленном embedding.
 * @returns {Record<string, any>} Payload для хранения и выдачи наружу.
 */
export function buildSemanticPayload(
	contentData: ContentData,
	contentHash: string,
	embeddingResult: EmbeddingResult
): Record<string, any> {
	const metadata = contentData.metadata || {};
	const originalId = extractOriginalId(contentData.id, metadata);

	return {
		pointId: contentData.id,
		originalId,
		contentType: contentData.contentType,
		title: contentData.title || '',
		content: contentData.content,
		contentHash,
		vectorizedAt: new Date().toISOString(),
		embeddingModel: embeddingResult.model,
		embeddingInfo: {
			dimensions: embeddingResult.dimensions,
			chunked: embeddingResult.chunked,
			chunkCount: embeddingResult.chunkCount || 1,
			usage: embeddingResult.usage,
		},
		...metadata,
	};
}

/**
 * @description Создаёт сниппет вокруг наиболее релевантного куска текста.
 * Одинаково используется Qdrant и SQLite backend-ами для единообразного UI.
 * @param {string} content - Полный текст документа.
 * @param {string} query - Поисковый запрос пользователя.
 * @param {number} [maxLength=200] - Максимальная длина сниппета.
 * @returns {string} Короткий фрагмент текста.
 */
export function generateSnippet(
	content: string,
	query: string,
	maxLength = 200
): string {
	if (!content || !query) return '';

	const queryTerms = query
		.toLowerCase()
		.split(/\s+/)
		.filter(term => term.length > 2);
	const contentLower = content.toLowerCase();

	let bestPosition = 0;
	let maxMatches = 0;

	for (let i = 0; i < content.length - maxLength; i += 20) {
		const segment = contentLower.substring(i, i + maxLength);
		const matches = queryTerms.reduce((count, term) => {
			return count + (segment.includes(term) ? 1 : 0);
		}, 0);

		if (matches > maxMatches) {
			maxMatches = matches;
			bestPosition = i;
		}
	}

	let snippet = content.substring(bestPosition, bestPosition + maxLength);

	if (bestPosition > 0) {
		const firstSpace = snippet.indexOf(' ');
		if (firstSpace > 0 && firstSpace < 50) {
			snippet = '...' + snippet.substring(firstSpace);
		}
	}

	if (bestPosition + maxLength < content.length) {
		const lastSpace = snippet.lastIndexOf(' ');
		if (lastSpace > maxLength - 50) {
			snippet = snippet.substring(0, lastSpace) + '...';
		}
	}

	return snippet.trim();
}

/**
 * @description Возвращает косинусное сходство между двумя embedding-векторами.
 * @param {number[]} a - Первый embedding.
 * @param {number[]} b - Второй embedding.
 * @returns {number} Значение в диапазоне [-1, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error('Embeddings must have same dimensions');
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	if (normA === 0 || normB === 0) {
		return 0;
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
