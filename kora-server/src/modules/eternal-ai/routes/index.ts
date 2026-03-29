import type { Express, Request, Response } from 'express';
import {
	getEternalAiDatabasePath,
	getEternalAiService,
} from '../services/eternal-ai-service-singleton.js';

/**
 * @description Регистрирует HTTP-маршруты Eternal AI history/chat модуля.
 * @param {Express} app - Экземпляр Express-приложения.
 * @returns {void}
 */
export function registerEternalAiRoutes(app: Express): void {
	app.get('/eternal_ai/health', (_req: Request, res: Response) => {
		try {
			const service = getEternalAiService();
			res.json({
				...service.getHealth(),
				databasePath: getEternalAiDatabasePath(),
			});
		} catch (error: any) {
			res.status(500).json({
				status: 'error',
				hasApiKey: false,
				databasePath: getEternalAiDatabasePath(),
				error: error.message,
			});
		}
	});

	app.get('/eternal_ai/conversations', (_req: Request, res: Response) => {
		try {
			const service = getEternalAiService();
			res.json({
				success: true,
				conversations: service.listConversations(),
			});
		} catch (error: any) {
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get(
		'/eternal_ai/conversations/:conversationId/messages',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				res.json({
					success: true,
					messages: service.listMessages(req.params.conversationId),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.get(
		'/eternal_ai/conversations/:conversationId/artifacts',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				const limit = Number.parseInt(String(req.query.limit || '100'), 10);
				const type =
					typeof req.query.type === 'string' ? req.query.type : undefined;
				const context =
					typeof req.query.context === 'string' ? req.query.context : undefined;
				res.json({
					success: true,
					artifacts: service.listArtifacts({
						conversationId: req.params.conversationId,
						type,
						context,
						limit: Number.isFinite(limit) ? limit : 100,
					}),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.post(
		'/eternal_ai/conversations/:conversationId/artifacts',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				res.json({
					success: true,
					artifact: service.createSeedArtifact({
						conversationId: req.params.conversationId,
						type: req.body?.type,
						context: req.body?.context,
						text: req.body?.text,
						metadata: req.body?.metadata ?? null,
					}),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.delete(
		'/eternal_ai/conversations/:conversationId/artifacts/:artifactId',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				res.json({
					success: true,
					deleted: service.deleteArtifact(
						req.params.conversationId,
						req.params.artifactId
					),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.put(
		'/eternal_ai/conversations/:conversationId/artifacts/:artifactId',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				res.json({
					success: true,
					artifact: service.updateArtifact({
						conversationId: req.params.conversationId,
						artifactId: req.params.artifactId,
						type: req.body?.type,
						context: req.body?.context,
						text: req.body?.text,
						metadata: req.body?.metadata ?? null,
					}),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.get(
		'/eternal_ai/conversations/:conversationId/traces',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				const limit = Number.parseInt(String(req.query.limit || '20'), 10);
				res.json({
					success: true,
					traces: service.listTurnTraces(
						req.params.conversationId,
						Number.isFinite(limit) ? limit : 20
					),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.delete(
		'/eternal_ai/conversations/:conversationId/messages/:messageId',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				res.json({
					success: true,
					deleted: service.deleteMessage(
						req.params.conversationId,
						req.params.messageId
					),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.delete(
		'/eternal_ai/conversations/:conversationId',
		(req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				res.json({
					success: true,
					deleted: service.deleteConversation(req.params.conversationId),
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.post('/eternal_ai/chat', async (req: Request, res: Response) => {
		try {
			const service = getEternalAiService();
			const result = await service.sendMessage(req.body || {});
			res.json({
				success: true,
				...result,
			});
		} catch (error: any) {
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get(
		'/eternal_ai/creative-effects',
		async (_req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				const effects = await service.listCreativeEffects();
				res.json({ success: true, effects });
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.post(
		'/eternal_ai/creative/generate',
		async (req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				const result = await service.startCreativeEffect(req.body || {});
				res.json({
					success: true,
					...result,
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.post(
		'/eternal_ai/custom/generate',
		async (req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				const result = await service.startCustomGeneration(req.body || {});
				res.json({
					success: true,
					...result,
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);

	app.post('/eternal_ai/safety-check', async (req: Request, res: Response) => {
		try {
			const service = getEternalAiService();
			const result = await service.safetyCheckS4(req.body || {});
			res.json({
				success: true,
				result,
			});
		} catch (error: any) {
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get(
		'/eternal_ai/creative/poll/:requestId',
		async (req: Request, res: Response) => {
			try {
				const service = getEternalAiService();
				const result = await service.pollCreativeEffect(req.params.requestId);
				res.json({
					success: true,
					poll: result,
				});
			} catch (error: any) {
				res.status(500).json({ success: false, error: error.message });
			}
		}
	);
}
