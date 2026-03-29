import { describe, expect, it } from 'vitest';
import { chunkNote } from '../model/chunker.js';
import { makeCacheFromMarkdown } from './cache-fixtures.js';
import { buildArtifactsFromObsidianChunks } from '../../memory/adapters/obsidian-chunk-artifact-adapter.js';
import {
	buildDialogueArtifactsFromArchiveMessages,
	buildSourceUnitsFromArchiveMessages,
} from '../../memory/adapters/telegram-archive-artifact-adapter.js';
import { parseAssistantResponse } from '../../runtime/model/response-parser.js';
import type { ArchiveMessage } from '../../../../contracts/src/telegram.js';

const baseContext = {
	notePath: 'Data/Notes/test.md',
	originalId: 'obsidian:Data/Notes/test.md',
	frontmatter: {},
	tags: ['tag1'],
	aliases: ['alias1'],
};

describe('memory/runtime adapters', () => {
	it('maps Obsidian chunks to document artifacts', () => {
		const markdown = '# Food\n\nOlive oil is healthy.';
		const cache = makeCacheFromMarkdown(markdown);
		const chunks = chunkNote(markdown, baseContext, undefined, cache);
		const artifacts = buildArtifactsFromObsidianChunks(chunks);

		expect(artifacts).toHaveLength(1);
		expect(artifacts[0].artifactType).toBe('document_chunk');
		expect(artifacts[0].context).toBe('source');
		expect(artifacts[0].sourceType).toBe('obsidian_note');
		expect(artifacts[0].sourceRefs).toEqual(['Data/Notes/test.md']);
		expect(artifacts[0].embeddingText).toContain('Olive oil is healthy.');
	});

	it('builds telegram source units and dialogue artifacts', () => {
		const messages: ArchiveMessage[] = [
			{
				messagePk: 'pk-1',
				chatId: 'chat-1',
				messageId: 1,
				timestampUtc: '2025-01-01T10:00:00.000Z',
				senderDisplayName: 'Alice',
				textRaw: 'Привет',
				textNormalized: 'Привет',
				contentHash: 'hash-1',
			},
			{
				messagePk: 'pk-2',
				chatId: 'chat-1',
				messageId: 2,
				timestampUtc: '2025-01-01T10:03:00.000Z',
				senderDisplayName: 'Bob',
				replyToMessageId: 1,
				textRaw: 'И тебе привет',
				textNormalized: 'И тебе привет',
				contentHash: 'hash-2',
			},
		];

		const sourceUnits = buildSourceUnitsFromArchiveMessages(messages, {
			chatId: 'chat-1',
		});
		const artifacts = buildDialogueArtifactsFromArchiveMessages(messages, {
			chatId: 'chat-1',
			chatTitle: 'Demo chat',
			windowSize: 4,
			gapMinutes: 30,
		});

		expect(sourceUnits).toHaveLength(2);
		expect(sourceUnits[1].unitType).toBe('message');
		expect(artifacts).toHaveLength(1);
		expect(artifacts[0].artifactType).toBe('dialogue_window');
		expect(artifacts[0].context).toBe('source');
		expect(artifacts[0].metadata?.contentType).toBe('telegram_comment');
		expect(artifacts[0].text).toContain('Alice');
		expect(artifacts[0].text).toContain('Bob');
	});

	it('parses structured assistant response blocks', () => {
		const parsed = parseAssistantResponse(`
<assistant_text>Привет, я рядом.</assistant_text>
<action>улыбается</action>
<environment>{"mood":"warm"}</environment>
<memory>Пользователь любит ночные прогулки</memory>
		`);

		expect(parsed.assistantText).toBe('Привет, я рядом.');
		expect(parsed.actions).toEqual(['улыбается']);
		expect(parsed.environmentPatch).toEqual({ mood: 'warm' });
		expect(parsed.memoryCandidates).toEqual([
			'Пользователь любит ночные прогулки',
		]);
		expect(parsed.displayText).toContain('**улыбается**');
	});
});
