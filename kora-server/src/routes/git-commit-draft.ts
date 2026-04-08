import type { Express, Request, Response } from 'express';
import type {
	GitCommitDraftRequest,
	GitCommitDraftResponse,
} from '../../../packages/contracts/src/git-commit-draft.js';
import { getConfig } from '../services/config-service.js';
import { resolveChatCompletionTransport } from '../modules/eternal-ai/resolve-openclaw-chat-completion.js';

interface ChatCompletionResponse {
	choices?: Array<{
		message?: {
			content?: unknown;
		};
	}>;
	error?: {
		message?: string;
	};
}

function extractContentText(content: unknown): string {
	if (typeof content === 'string') {
		return content.trim();
	}

	if (Array.isArray(content)) {
		return content
			.map(part => {
				if (typeof part === 'string') {
					return part;
				}
				if (
					part &&
					typeof part === 'object' &&
					'text' in part &&
					typeof (part as { text?: unknown }).text === 'string'
				) {
					return (part as { text: string }).text;
				}
				return '';
			})
			.join('\n')
			.trim();
	}

	return '';
}

function extractJsonObject(text: string): string {
	const firstBrace = text.indexOf('{');
	const lastBrace = text.lastIndexOf('}');
	if (firstBrace < 0 || lastBrace <= firstBrace) {
		throw new Error('OpenClaw не вернул JSON-объект для commit draft.');
	}
	return text.slice(firstBrace, lastBrace + 1);
}

function buildPrompt(request: GitCommitDraftRequest): string {
	return [
		'Ты генерируешь draft git commit message.',
		'Верни только JSON-объект без markdown и пояснений.',
		'Формат JSON:',
		'{',
		'  "subject": string,',
		'  "bodyLines": string[],',
		'  "warnings": string[]',
		'}',
		'Правила:',
		'- subject обязательно в формате "<type>: <TICKET-ID> <summary>"',
		'- ticket должен стоять сразу после двоеточия',
		'- не добавляй ticket в body, если он уже есть в subject',
		'- body опционален и должен быть кратким',
		'- не выдумывай intent сверх diff',
		'- если staged changes маленькие, bodyLines может быть пустым массивом',
		'- если изменены submodule pointers, явно упомяни это в bodyLines',
		'Контекст:',
		JSON.stringify(request, null, 2),
	].join('\n');
}

async function generateDraft(
	request: GitCommitDraftRequest
): Promise<GitCommitDraftResponse> {
	const config = getConfig();
	if (!config.eternalAiModel) {
		throw new Error('ETERNAL_AI_MODEL не задан в конфигурации сервера.');
	}

	const transport = resolveChatCompletionTransport(config.eternalAiModel, {
		baseUrl: config.eternalAiBaseUrl || 'https://open.eternalai.org/v1',
		apiKey: config.eternalAiApiKey || '',
	});

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (transport.kind === 'eternal_x_api_key') {
		headers['x-api-key'] = transport.apiKey;
	} else {
		headers.Authorization = `Bearer ${transport.apiKey}`;
	}

	const response = await fetch(`${transport.baseUrl}/chat/completions`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			model: transport.upstreamModelId,
			stream: false,
			messages: [
				{
					role: 'system',
					content:
						'Ты помощник по git commit messages. Возвращай только валидный JSON.',
				},
				{
					role: 'user',
					content: buildPrompt(request),
				},
			],
		}),
	});

	if (!response.ok) {
		const errorPayload = (await response
			.json()
			.catch(() => null)) as ChatCompletionResponse | null;
		throw new Error(
			errorPayload?.error?.message ||
				`Chat completions HTTP ${response.status}: ${response.statusText}`
		);
	}

	const payload = (await response.json()) as ChatCompletionResponse;
	const rawText = extractContentText(payload.choices?.[0]?.message?.content);
	if (!rawText) {
		throw new Error('OpenClaw вернул пустой ответ для commit draft.');
	}

	const parsed = JSON.parse(
		extractJsonObject(rawText)
	) as Partial<GitCommitDraftResponse>;

	if (typeof parsed.subject !== 'string' || !parsed.subject.trim()) {
		throw new Error('OpenClaw вернул draft без subject.');
	}

	return {
		subject: parsed.subject.trim(),
		bodyLines: Array.isArray(parsed.bodyLines)
			? parsed.bodyLines.filter(
					(line): line is string => typeof line === 'string'
				)
			: [],
		warnings: Array.isArray(parsed.warnings)
			? parsed.warnings.filter(
					(line): line is string => typeof line === 'string'
				)
			: [],
	};
}

export function registerGitCommitDraftRoutes(app: Express): void {
	app.post('/git/commit-message', async (req: Request, res: Response) => {
		try {
			const request = req.body as GitCommitDraftRequest;
			if (!request?.repoId || !request?.branch || !request?.ticketId) {
				res.status(400).json({
					success: false,
					error: 'repoId, branch и ticketId обязательны.',
				});
				return;
			}

			const draft = await generateDraft(request);
			res.json({
				success: true,
				draft,
			});
		} catch (error: any) {
			res.status(500).json({
				success: false,
				error: error.message || 'Не удалось сгенерировать commit draft.',
			});
		}
	});
}
