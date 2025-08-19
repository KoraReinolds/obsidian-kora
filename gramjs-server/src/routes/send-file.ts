/**
 * Route: /send_file
 * Sends a file to the given peer.
 */

import type { Express, Request, Response } from 'express';
import { existsSync } from 'fs';
import { initClient } from '../services/strategy-service.js';
import type { SendFileRequest, SendMessageResponse } from '../../../telegram-types.js';

/**
 * JSDoc: Registers POST /send_file endpoint.
 */
export function registerSendFileRoute(app: Express): void {
  app.post('/send_file', async (req: Request, res: Response) => {
    try {
      const requestData: SendFileRequest = req.body;
      const { peer, filePath, caption } = requestData;
      
      if (!peer || !filePath) return res.status(400).json({ error: 'peer and filePath are required' });
      if (!existsSync(filePath)) return res.status(400).json({ error: 'File not found' });

      const strategy = await initClient();
      const result = await strategy.sendFile(peer, { file: filePath, caption: caption || '' });
      
      const response: SendMessageResponse = { 
        success: true, 
        message: 'File sent successfully', 
        mode: strategy.getMode(), 
        result 
      };
      
      res.json(response);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[send_file] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
