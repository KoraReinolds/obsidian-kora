/**
 * Route: /send_message
 * Sends a text message with optional emoji entities and inline buttons.
 */

import type { Express, Request, Response } from 'express';
import { initClient } from '../services/strategy-service.js';
import { createInlineKeyboard } from '../utils/keyboard.js';
import type {
	MessageOptions,
	SendMessageRequest,
	SendMessageResponse,
} from '../../../telegram-types.js';
import {
	processMessage,
	validateMessageParams,
} from '../utils/markdown-converter.js';

/**
 * JSDoc: Registers POST /send_message endpoint.
 */
export function registerSendMessageRoute(app: Express): void {
	app.post('/send_message', async (req: Request, res: Response) => {
		try {
			const requestData: SendMessageRequest = req.body;
			const {
				peer,
				message,
				fileName,
				entities,
				buttons,
				disableWebPagePreview,
			} = requestData;

			// Validate required parameters
			validateMessageParams('send', { peer, message });

			const strategy = await initClient();
			const mode = strategy.getMode();

			// Process message (handles both regular and markdown)
			const processed = processMessage({
				peer,
				message,
				fileName,
				entities,
				buttons,
				disableWebPagePreview,
				mode,
			});

			const messageOptions: MessageOptions = {
				message: processed.finalMessage,
			};

			if (processed.finalEntities.length > 0) {
				messageOptions.formattingEntities =
					processed.finalEntities as unknown as Array<{
						[key: string]: unknown;
					}>;
			}

			if (processed.disableWebPagePreview !== undefined) {
				messageOptions.disableWebPagePreview = processed.disableWebPagePreview;
			}

			// Handle inline buttons using existing keyboard utility
			const inlineButtons = createInlineKeyboard(buttons);
			if (inlineButtons || processed.replyMarkup) {
				messageOptions.replyMarkup = processed.replyMarkup || inlineButtons;
			}

			const result = await strategy.sendMessage(peer, messageOptions);

			const response: SendMessageResponse = {
				success: true,
				message: 'Message sent successfully',
				mode,
				result,
			};

			// Add conversion info if markdown was used
			if (processed.conversionInfo) {
				response.conversionInfo = processed.conversionInfo;
			}

			res.json(response);
		} catch (error: any) {
			// eslint-disable-next-line no-console
			console.error('[send_message] Error:', error);
			res.status(500).json({ error: error.message });
		}
	});
}
