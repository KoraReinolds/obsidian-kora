/**
 * @module obsidian-plugin/obsidian/host-image-context-menu
 * @description Фабрика {@link Menu} Obsidian для превью изображений: копирование в буфер и сохранение в vault.
 */

import type { App as ObsidianApp } from 'obsidian';
import { Menu, Notice, normalizePath, requestUrl } from 'obsidian';
import type { HostImageContextMenuFn } from '../ui-vue/injection-keys';

const MIME_TO_EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
};

/**
 * @description Определяет расширение файла по MIME (без учёта параметров {@code ;charset=...}).
 * @param {string} mime - Значение Content-Type или аналог из data URL.
 * @returns {string} Расширение без точки; по умолчанию {@code png}.
 */
/**
 * @description Исправляет заведомо битые MIME (опечатки CDN/API), чтобы {@link Blob} и canvas корректно декодировали.
 * @param {string} mime - Сырое значение Content-Type или data URL.
 * @returns {string} Нормализованный MIME.
 */
function normalizeImageMime(mime: string): string {
	const base = mime.split(';')[0]?.trim().toLowerCase() ?? 'image/png';
	if (base === 'image/jepeg') {
		return 'image/jpeg';
	}
	return base;
}

function extFromMime(mime: string): string {
	const base = normalizeImageMime(mime);
	return MIME_TO_EXT[base] ?? 'png';
}

/**
 * @description Декодирует data URL с base64 в бинарные данные.
 * @param {string} src - Полная строка data URL.
 * @returns {{ mime: string, buffer: ArrayBuffer } | null} Результат или {@code null} при ошибке.
 */
function parseDataUrl(
	src: string
): { mime: string; buffer: ArrayBuffer } | null {
	const trimmed = src.trim();
	const base64Match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
	if (!base64Match) {
		return null;
	}
	const mimePart = base64Match[1];
	const b64Part = base64Match[2];
	if (mimePart === undefined || b64Part === undefined) {
		return null;
	}
	const mime = normalizeImageMime(mimePart);
	const b64 = b64Part;
	try {
		const binary = atob(b64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return { mime, buffer: bytes.buffer };
	} catch {
		return null;
	}
}

/**
 * @async
 * @description Загружает изображение по {@code src} в {@link ArrayBuffer} с определением MIME.
 * @param {string} src - data URL, {@code http(s)} или иной URL, доступный через {@link fetch}.
 * @returns {Promise<{ mime: string, buffer: ArrayBuffer }>}
 * @throws {Error} Если загрузка или разбор не удались.
 */
async function imageSrcToBuffer(src: string): Promise<{
	mime: string;
	buffer: ArrayBuffer;
}> {
	const data = parseDataUrl(src);
	if (data) {
		return data;
	}

	if (/^https?:\/\//i.test(src)) {
		const res = await requestUrl({ url: src, method: 'GET' });
		const rawType = res.headers['content-type'];
		const mime = normalizeImageMime(
			(typeof rawType === 'string'
				? rawType.split(';')[0]?.trim()
				: undefined) || 'image/png'
		);
		return { mime, buffer: res.arrayBuffer };
	}

	const res = await fetch(src);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status}`);
	}
	const mime = normalizeImageMime(
		res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/png'
	);
	return { mime, buffer: await res.arrayBuffer() };
}

/**
 * @description Убирает опасные символы и ограничивает длину базового имени файла.
 * @param {string} name - Имя файла или подпись вложения из UI.
 * @returns {string} Без расширения, пригодно для сегмента пути.
 */
function sanitizeBaseName(name: string): string {
	const withoutExt = name.replace(/\.[^.\\/]+$/, '');
	const s = withoutExt.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'kora-image';
	return s.slice(0, 80);
}

/**
 * @async
 * @description Создаёт папку в vault, если её ещё нет.
 * @param {ObsidianApp['vault']} vault - Текущее хранилище.
 * @param {string} path - Путь к папке внутри vault.
 * @returns {Promise<void>}
 */
async function ensureFolder(
	vault: ObsidianApp['vault'],
	path: string
): Promise<void> {
	const normalized = normalizePath(path);
	if (vault.getAbstractFileByPath(normalized)) {
		return;
	}
	await vault.createFolder(normalized);
}

/** MIME для {@link ClipboardItem}: в Chromium/Obsidian запись картинки в буфер почти всегда только через {@code image/png}. */
const CLIPBOARD_IMAGE_MIME = 'image/png';

/**
 * @async
 * @description Перекодирует растровое изображение в PNG для {@link navigator.clipboard.write}.
 * Без этого JPEG/WebP и др. дают ошибку вида «type image/jpeg not supported for write».
 * @param {ArrayBuffer} buffer - Сырые пиксели во входном формате.
 * @param {string} mime - Исходный MIME (из data URL или заголовка).
 * @returns {Promise<Blob>} Блоб {@code image/png}.
 * @throws {Error} Если декодирование или canvas не удались.
 */
async function bufferToPngBlobForClipboard(
	buffer: ArrayBuffer,
	mime: string
): Promise<Blob> {
	const baseMime = normalizeImageMime(mime);
	if (baseMime === CLIPBOARD_IMAGE_MIME) {
		return new Blob([buffer], { type: CLIPBOARD_IMAGE_MIME });
	}
	const blob = new Blob([buffer], {
		type: baseMime || 'application/octet-stream',
	});
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('decode'));
			img.src = url;
		});
		const w = img.naturalWidth;
		const h = img.naturalHeight;
		if (!w || !h) {
			throw new Error('empty image');
		}
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('canvas');
		}
		ctx.drawImage(img, 0, 0);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				b => (b ? resolve(b) : reject(new Error('toBlob'))),
				CLIPBOARD_IMAGE_MIME
			);
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * @description Строит обработчик ПКМ: показывает {@link Menu} с действиями над изображением.
 * @param {ObsidianApp} app - Экземпляр приложения Obsidian.
 * @returns {HostImageContextMenuFn} Функция для `provide(HOST_IMAGE_CONTEXT_MENU, …)`.
 */
export function createHostImageContextMenuHandler(
	app: ObsidianApp
): HostImageContextMenuFn {
	return (event: MouseEvent, imageSrc: string, meta): void => {
		const menu = new Menu();

		menu.addItem(item => {
			item.setTitle('Скопировать изображение');
			item.onClick(async () => {
				try {
					const { mime, buffer } = await imageSrcToBuffer(imageSrc);
					const pngBlob = await bufferToPngBlobForClipboard(buffer, mime);
					await navigator.clipboard.write([
						new ClipboardItem({
							[CLIPBOARD_IMAGE_MIME]: pngBlob,
						}),
					]);
					new Notice('Изображение скопировано в буфер обмена');
				} catch (e) {
					new Notice(
						`Не удалось скопировать: ${e instanceof Error ? e.message : String(e)}`
					);
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('Сохранить в хранилище…');
			item.onClick(async () => {
				try {
					const { mime, buffer } = await imageSrcToBuffer(imageSrc);
					const ext = extFromMime(mime);
					const base = meta?.suggestedFileName
						? sanitizeBaseName(meta.suggestedFileName)
						: 'kora-image';
					const dir = 'kora-images';
					await ensureFolder(app.vault, dir);
					const fileName = `${base}-${Date.now()}.${ext}`;
					const path = normalizePath(`${dir}/${fileName}`);
					await app.vault.createBinary(path, buffer);
					new Notice(`Сохранено: ${path}`);
				} catch (e) {
					new Notice(
						`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`
					);
				}
			});
		});

		menu.showAtMouseEvent(event);
	};
}
