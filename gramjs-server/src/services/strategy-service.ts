/**
 * StrategyService: Initializes, caches, and manages TelegramClientStrategy.
 * Decouples strategy lifecycle and exposes helpers for routes.
 */

import StrategyFactory from '../strategies/StrategyFactory.js';
import type { TelegramClientStrategy } from '../strategies/TelegramClientStrategy.js';
import { getConfig } from './config-service.js';

let currentStrategy: TelegramClientStrategy | null = null;

/**
 * JSDoc: Returns a connected strategy instance, reusing it when possible.
 */
export async function initClient(): Promise<TelegramClientStrategy> {
  const cfg = getConfig();

  if (currentStrategy && currentStrategy.isClientConnected() && currentStrategy.getMode() === cfg.mode) {
    return currentStrategy;
  }

  if (currentStrategy && currentStrategy.getMode() !== cfg.mode) {
    try {
      await currentStrategy.disconnect();
    } catch (e) {
      // ignore
    }
    currentStrategy = null;
  }

  const strategy = StrategyFactory.createValidatedStrategy(cfg.mode, cfg as any);
  await strategy.initialize();
  currentStrategy = strategy;
  return strategy;
}

/**
 * JSDoc: Returns current strategy or null.
 */
export function getCurrentStrategy(): TelegramClientStrategy | null {
  return currentStrategy;
}

/**
 * JSDoc: Disconnect and clear strategy if exists.
 */
export async function disconnectStrategy(): Promise<void> {
  if (!currentStrategy) return;
  try {
    await currentStrategy.disconnect();
  } finally {
    currentStrategy = null;
  }
}
