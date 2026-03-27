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
