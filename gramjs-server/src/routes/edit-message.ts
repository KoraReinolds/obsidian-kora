/**
 * Route: /edit_message
 * Edits an existing message text with optional emoji entities.
 */

import type { Express, Request, Response } from 'express';
import { initClient } from '../services/strategy-service.js';
import type { MessageOptions, EditMessageRequest, SendMessageResponse } from '../../../telegram-types.js';
import { processMessage, validateMessageParams } from '../utils/markdown-converter.js';

/**
 * JSDoc: Registers POST /edit_message endpoint.
 */
export function registerEditMessageRoute(app: Express): void {
  app.post('/edit_message', async (req: Request, res: Response) => {
    try {
      const requestData: EditMessageRequest = req.body;
      const { 
        peer, 
        messageId, 
        message, 
        entities, 
        buttons,
        disableWebPagePreview 
      } = requestData;

      // Validate required parameters
      validateMessageParams('edit', { peer, messageId, message });
    
      const strategy = await initClient();
      const mode = strategy.getMode();

      // Process message (handles both regular and markdown)
      const processed = processMessage({
        peer,
        message,
        fileName: undefined, // EditMessageRequest doesn't have fileName
        entities,
        buttons,
        disableWebPagePreview,
        mode,
      }); 

      const messageOptions: MessageOptions = { message: processed.finalMessage };

      if (processed.finalEntities.length > 0) {
        messageOptions.formattingEntities = processed.finalEntities as unknown as Array<{
          [key: string]: unknown;
        }>;
      }

      if (processed.disableWebPagePreview !== undefined) {
        messageOptions.disableWebPagePreview = processed.disableWebPagePreview;
      }

      // Handle inline buttons for edit operation
      if (processed.replyMarkup) {
        messageOptions.replyMarkup = processed.replyMarkup;
      }

      const result = await strategy.editMessage(peer, messageId, messageOptions);
      
      const response: SendMessageResponse = { 
        success: true, 
        message: 'Message edited successfully', 
        mode, 
        result 
      };
      
      // Add conversion info if markdown was used
      if (processed.conversionInfo) {
        response.conversionInfo = processed.conversionInfo;
      }
      
      res.json(response);
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('[edit_message] Error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });
}