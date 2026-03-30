/**
 * @module runtime/model/response-parser
 * @anchor <memory_runtime_turn>
 * @description Минимальный parser ответа модели для MVP. Поддерживает два режима:
 * свободный текст и optional structured blocks (`<assistant_text>`, `<thought>`,
 * `<private_thought>`, `<action>`, `<environment>`, `<memory>`). Это позволяет сразу дебажить typed output, не
 * ломая plain text сценарии.
 */

import type { ParsedAssistantResponse, ResponseParserPort } from './types.js';
import {
	renderCanonicalChatPartsToText,
	type CanonicalChatMessagePart,
} from '../../../../contracts/src/canonical-chat-message.js';

function extractTaggedBlocks(rawText: string, tagName: string): string[] {
	const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
	const result: string[] = [];
	let match: RegExpExecArray | null = null;
	while ((match = pattern.exec(rawText)) !== null) {
		const value = match[1]?.trim();
		if (value) {
			result.push(value);
		}
	}
	return result;
}

function stripTaggedBlocks(rawText: string): string {
	return rawText
		.replace(/<assistant_text>[\s\S]*?<\/assistant_text>/gi, '')
		.replace(/<thought>[\s\S]*?<\/thought>/gi, '')
		.replace(/<private_thought>[\s\S]*?<\/private_thought>/gi, '')
		.replace(/<action>[\s\S]*?<\/action>/gi, '')
		.replace(/<environment>[\s\S]*?<\/environment>/gi, '')
		.replace(/<memory>[\s\S]*?<\/memory>/gi, '')
		.trim();
}

function parseEnvironmentBlock(
	rawBlock: string
): Record<string, unknown> | undefined {
	if (!rawBlock.trim()) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(rawBlock) as unknown;
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return {
			value: parsed,
		};
	} catch {
		return {
			raw: rawBlock.trim(),
		};
	}
}

function extractLeadingActions(rawText: string): {
	actions: string[];
	remainingText: string;
} {
	const actions: string[] = [];
	let remainingText = rawText.trim();
	let matched = true;

	while (matched) {
		matched = false;
		const strong = remainingText.match(/^\*\*([^*]+)\*\*\s*/);
		if (strong) {
			actions.push(strong[1].trim());
			remainingText = remainingText.slice(strong[0].length).trimStart();
			matched = true;
			continue;
		}
		const italic = remainingText.match(/^\*([^*]+)\*\s*/);
		if (italic) {
			actions.push(italic[1].trim());
			remainingText = remainingText.slice(italic[0].length).trimStart();
			matched = true;
		}
	}

	return { actions, remainingText: remainingText.trim() };
}

function extractOrderedTaggedBlocks(
	rawText: string
): Array<{ tag: string; value: string }> {
	const pattern =
		/<(assistant_text|thought|private_thought|action|environment|memory)>([\s\S]*?)<\/\1>/gi;
	const result: Array<{ tag: string; value: string }> = [];
	let match: RegExpExecArray | null = null;
	while ((match = pattern.exec(rawText)) !== null) {
		const value = match[2]?.trim();
		if (!value) {
			continue;
		}
		result.push({
			tag: String(match[1] || '').toLowerCase(),
			value,
		});
	}
	return result;
}

/**
 * @description Парсит ответ модели в typed output. Если structured blocks нет,
 * parser мягко деградирует в plain text + optional leading actions.
 * @param {string} rawText - Ответ модели.
 * @returns {ParsedAssistantResponse}
 */
export function parseAssistantResponse(
	rawText: string
): ParsedAssistantResponse {
	const normalizedRawText = rawText.trim();
	const orderedBlocks = extractOrderedTaggedBlocks(normalizedRawText);
	const assistantTextBlocks = extractTaggedBlocks(
		normalizedRawText,
		'assistant_text'
	);
	const thoughtBlocks = extractTaggedBlocks(normalizedRawText, 'thought');
	const privateThoughtBlocks = extractTaggedBlocks(
		normalizedRawText,
		'private_thought'
	);
	const actionBlocks = extractTaggedBlocks(normalizedRawText, 'action');
	const environmentBlocks = extractTaggedBlocks(
		normalizedRawText,
		'environment'
	);
	const memoryBlocks = extractTaggedBlocks(normalizedRawText, 'memory');
	const hasStructuredBlocks =
		assistantTextBlocks.length > 0 ||
		thoughtBlocks.length > 0 ||
		privateThoughtBlocks.length > 0 ||
		actionBlocks.length > 0 ||
		environmentBlocks.length > 0 ||
		memoryBlocks.length > 0;

	if (hasStructuredBlocks) {
		const assistantText = assistantTextBlocks.join('\n\n').trim();
		const parts: CanonicalChatMessagePart[] = [];
		for (const block of orderedBlocks) {
			if (block.tag === 'assistant_text') {
				parts.push({ kind: 'speech', text: block.value });
				continue;
			}
			if (block.tag === 'thought') {
				parts.push({
					kind: 'thought',
					text: block.value,
					visibility: 'spoiler',
				});
				continue;
			}
			if (block.tag === 'action') {
				parts.push({ kind: 'action', text: block.value });
			}
		}
		const memoryCandidates = memoryBlocks
			.flatMap(block =>
				block
					.split('\n')
					.map(line => line.trim())
					.filter(Boolean)
			)
			.filter(Boolean);
		const environmentPatch = environmentBlocks[0]
			? parseEnvironmentBlock(environmentBlocks[0])
			: undefined;
		const displayText = renderCanonicalChatPartsToText(parts);

		return {
			rawText: normalizedRawText,
			assistantText,
			parts,
			actions: actionBlocks,
			privateThoughts: privateThoughtBlocks,
			environmentPatch,
			memoryCandidates,
			displayText,
			usedStructuredBlocks: true,
		};
	}

	const withoutBlocks = stripTaggedBlocks(normalizedRawText);
	const { actions, remainingText } = extractLeadingActions(withoutBlocks);
	const assistantText = remainingText || normalizedRawText;
	const parts: CanonicalChatMessagePart[] = [
		...actions.map(
			action =>
				({
					kind: 'action',
					text: action,
				}) satisfies CanonicalChatMessagePart
		),
		...(assistantText
			? [
					{
						kind: 'speech',
						text: assistantText,
					} satisfies CanonicalChatMessagePart,
				]
			: []),
	];
	const displayText = renderCanonicalChatPartsToText(parts);

	return {
		rawText: normalizedRawText,
		assistantText,
		parts,
		actions,
		privateThoughts: [],
		memoryCandidates: [],
		displayText,
		usedStructuredBlocks: false,
	};
}

/**
 * @description Минимальная реализация порта parser-а для TurnEngine.
 */
export class DefaultResponseParser implements ResponseParserPort {
	parse(rawText: string): ParsedAssistantResponse {
		return parseAssistantResponse(rawText);
	}
}
