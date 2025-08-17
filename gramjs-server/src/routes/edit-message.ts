/**
 * Route: /edit_message
 * Edits an existing message text with optional emoji entities.
 */

import type { Express, Request, Response } from 'express';
import { Api } from 'telegram';
import { initClient } from '../services/strategy-service.js';
import type { MessageOptions } from '../types/http.js';

/**
 * JSDoc: Registers POST /edit_message endpoint.
 */
export function registerEditMessageRoute(app: Express): void {
  app.post('/edit_message', async (req: Request, res: Response) => {
    try {
      const { peer, messageId, message, entities } = req.body;
      if (!peer || !messageId || !message) {
        return res.status(400).json({ error: 'peer, messageId and message are required' });
      }

      const strategy = await initClient();
      const messageOptions: MessageOptions = { message };

      if (entities && entities.length > 0) {
        messageOptions.formattingEntities = entities.map((entity: any) => new Api.MessageEntityCustomEmoji({
          offset: entity.offset,
          length: entity.length,
          documentId: entity.custom_emoji_id,
        }));
      }

      const result = await strategy.editMessage(peer, messageId, messageOptions);
      res.json({ success: true, message: 'Message edited successfully', mode: strategy.getMode(), result });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[edit_message] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}