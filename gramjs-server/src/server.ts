#!/usr/bin/env node

/**
 * Entry: GramJS Server
 * Minimal Express bootstrap that wires modular routes and services.
 * Supports both bot and userbot modes via command line arguments.
 */

// Load environment variables ASAP
import { config as configDotenv } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
configDotenv({ path: join(__dirname, '..', '.env') });

// Parse command line arguments
const args = process.argv.slice(2);
const portArg = args.find(arg => arg.startsWith('--port='));
const modeArg = args.find(arg => arg.startsWith('--mode='));

const PORT = portArg ? parseInt(portArg.split('=')[1]) : 8124;
const MODE = modeArg ? modeArg.split('=')[1] : 'bot';

// Set mode via environment variable
process.env.TELEGRAM_MODE = MODE;

import express from 'express';
import cors from 'cors';

// Route registrars
import { registerHealthRoutes } from './routes/health.js';
import { registerMeRoutes } from './routes/me.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerVectorizeRoute } from './routes/vectorize.js';
import { registerVectorizeMessagesRoute } from './routes/vectorize_messages.js';
import { registerSearchRoute } from './routes/search.js';
import { registerContentRoutes } from './routes/content.js';
import { registerVectorStatsRoute } from './routes/vector_stats.js';
import { registerVectorHealthRoute } from './routes/vector_health.js';
import { registerSendMessageRoute } from './routes/send-message.js';
import { registerSendFileRoute } from './routes/send-file.js';
import { registerSendNoteRoute } from './routes/send-note.js';

// Services
import { getConfig } from './services/config-service.js';
import { attachGracefulShutdown } from './services/shutdown-service.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Core routes
registerHealthRoutes(app);
registerSendMessageRoute(app);
registerSendFileRoute(app);
registerSendNoteRoute(app);
registerMeRoutes(app);
registerChannelRoutes(app);
registerMessageRoutes(app);
registerConfigRoutes(app);

// Vector routes
registerVectorizeRoute(app);
registerVectorizeMessagesRoute(app);
registerSearchRoute(app);
registerContentRoutes(app);
registerVectorStatsRoute(app);
registerVectorHealthRoute(app);

// Graceful shutdown
attachGracefulShutdown();

app.listen(PORT, '127.0.0.1', () => {
  const cfg = getConfig();

  // eslint-disable-next-line no-console
  console.log(`GramJS server running on http://127.0.0.1:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Mode: ${cfg.mode}`);
  // eslint-disable-next-line no-console
  console.log('Use Ctrl+C to stop');
});
