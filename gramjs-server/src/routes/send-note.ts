/**
 * Route: /send_note_as_image
 * Sends a simple HTML note as a file to the given peer.
 */

import type { Express, Request, Response } from 'express';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initClient } from '../services/strategy-service.js';
import { createInlineKeyboard } from '../utils/keyboard.js';
import type { FileOptions } from '../types/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * JSDoc: Registers POST /send_note_as_image endpoint.
 */
export function registerSendNoteRoute(app: Express): void {
  app.post('/send_note_as_image', async (req: Request, res: Response) => {
    try {
      const { peer, content, title, buttons } = req.body;
      if (!peer || !content) return res.status(400).json({ error: 'peer and content are required' });

      const tempDir = join(__dirname, '..', 'temp');
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

      const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;background:#fff}h1,h2,h3{color:#333}code{background:#f4f4f4;padding:2px 4px;border-radius:3px}pre{background:#f4f4f4;padding:10px;border-radius:5px;overflow-x:auto}blockquote{border-left:4px solid #ddd;margin:0;padding-left:20px}</style></head><body><h1>${title || 'Note'}</h1><div>${String(content).replace(/\n/g, '<br>')}</div></body></html>`;
      const htmlFile = join(tempDir, `note_${Date.now()}.html`);
      writeFileSync(htmlFile, htmlContent);

      const strategy = await initClient();
      const sendOptions: FileOptions = { file: htmlFile, caption: title || 'Note from Obsidian' };
      const inlineButtons = createInlineKeyboard(buttons);
      if (inlineButtons) sendOptions.replyMarkup = inlineButtons;

      const result = await strategy.sendFile(peer, sendOptions);
      unlinkSync(htmlFile);

      res.json({ success: true, message: 'Note sent as image successfully', mode: strategy.getMode(), result });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[send_note_as_image] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
