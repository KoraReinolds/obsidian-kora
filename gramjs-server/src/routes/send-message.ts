/**
 * Route: /send_message
 * Sends a text message with optional emoji entities and inline buttons.
 */

import type { Express, Request, Response } from 'express';
import { Api } from 'telegram';
import { initClient } from '../services/strategy-service.js';
import { createInlineKeyboard } from '../utils/keyboard.js';
import type { MessageOptions } from '../types/http.js';

/**
 * JSDoc: Registers POST /send_message endpoint.
 */
export function registerSendMessageRoute(app: Express): void {
  app.post('/send_message', async (req: Request, res: Response) => {
    try {
      const { peer, message, entities, buttons, disableWebPagePreview } = req.body;
      if (!peer || !message) return res.status(400).json({ error: 'peer and message are required' });

      const strategy = await initClient();
      const messageOptions: MessageOptions = { message };

      if (entities && entities.length > 0) {
        messageOptions.formattingEntities = entities.map((entity: any) => new Api.MessageEntityCustomEmoji({
          offset: entity.offset,
          length: entity.length,
          documentId: entity.custom_emoji_id,
        }));
      }

      if (disableWebPagePreview !== undefined) {
        messageOptions.disableWebPagePreview = disableWebPagePreview;
      }

      const inlineButtons = createInlineKeyboard(buttons);
      if (inlineButtons) {
        messageOptions.replyMarkup = {
          inline_keyboard: buttons.map((row: any) => row.map((btn: any) => ({
            text: btn.text,
            ...(btn.url ? { url: btn.url } : {}),
            ...(btn.data ? { callback_data: btn.data } : {}),
          }))),
        };
      }

      const result = await strategy.sendMessage(peer, messageOptions);
      res.json({ success: true, message: 'Message sent successfully', mode: strategy.getMode(), result });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[send_message] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
