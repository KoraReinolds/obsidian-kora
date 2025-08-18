/**
 * Route: /edit_message
 * Edits an existing message text with optional emoji entities.
 */

import type { Express, Request, Response } from 'express';
import { initClient } from '../services/strategy-service.js';
import type { MessageOptions } from '../types/http.js';
import { processMessage, validateMessageParams } from '../utils/markdown-converter.js';

/**
 * JSDoc: Registers POST /edit_message endpoint.
 */
export function registerEditMessageRoute(app: Express): void {
  app.post('/edit_message', async (req: Request, res: Response) => {
    try {
      const { 
        peer, 
        messageId, 
        message, 
        fileName,
        entities, 
        buttons,
        disableWebPagePreview 
      } = req.body;

      // Validate required parameters
      validateMessageParams('edit', { peer, messageId, message });

      // Process message (handles both regular and markdown)
      const processed = processMessage({
        peer,
        message,
        fileName,
        entities,
        buttons,  // Important: now edit_message also supports buttons!
        disableWebPagePreview
      }); 

      const strategy = await initClient();
      const messageOptions: MessageOptions = { message: processed.finalMessage };

      if (processed.finalEntities.length > 0) {
        messageOptions.formattingEntities = processed.finalEntities;
      }

      if (processed.disableWebPagePreview !== undefined) {
        messageOptions.disableWebPagePreview = processed.disableWebPagePreview;
      }

      // Handle inline buttons for edit operation
      if (processed.replyMarkup) {
        messageOptions.replyMarkup = processed.replyMarkup;
      }
      console.log('MESSAGE OPTIONS', messageOptions);
      const result = await strategy.editMessage(peer, messageId, messageOptions);
      
      const response: any = { 
        success: true, 
        message: 'Message edited successfully', 
        mode: strategy.getMode(), 
        result 
      };
      
      // Add conversion info if markdown was used
      if (processed.conversionInfo) {
        response.conversionInfo = processed.conversionInfo;
      }
      
      res.json(response);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[edit_message] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}