#!/usr/bin/env node

/**
 * Entry: Kora Server
 * Minimal Express bootstrap that wires modular routes and services.
 * Supports both bot and userbot modes via command line arguments.
 */

// Load environment variables ASAP from the package root, not from dist/
import { loadKoraServerEnv } from './services/env-loader.js';

loadKoraServerEnv();

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
import { registerPersonalAdminRoutes } from './modules/personal-admin/routes/index.js';
import { registerPublishRoutes } from './modules/publish/routes/index.js';
import { registerRuntimeRoutes } from './modules/runtime/routes/index.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMeRoutes } from './routes/me.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerConfigRoutes } from './routes/config.js';

// Services
import { getConfig } from './services/config-service.js';
import { attachGracefulShutdown } from './services/shutdown-service.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Core routes
registerHealthRoutes(app);
registerPublishRoutes(app);
registerMeRoutes(app);
registerChannelRoutes(app);
registerMessageRoutes(app);
registerConfigRoutes(app);

// Vector routes
registerRuntimeRoutes(app);

// Archive routes
registerPersonalAdminRoutes(app);

// Graceful shutdown
attachGracefulShutdown();

app.listen(PORT, '127.0.0.1', () => {
	const cfg = getConfig();

	// eslint-disable-next-line no-console
	console.log(`Kora server running on http://127.0.0.1:${PORT}`);
	// eslint-disable-next-line no-console
	console.log(`Mode: ${cfg.mode}`);
	// eslint-disable-next-line no-console
	console.log('Use Ctrl+C to stop');
});
