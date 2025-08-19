/**
 * Vitest setup file for Telegram module tests
 */

import { vi, expect, beforeEach, afterEach } from 'vitest';

// Global test configuration
beforeEach(() => {
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Restore all mocks after each test
  vi.restoreAllMocks();
});

// Global matchers and utilities
expect.extend({
  toBeEntityType(received: any, expectedType: string) {
    const pass = received && received.type === expectedType;
    if (pass) {
      return {
        message: () => `expected entity not to be of type ${expectedType}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected entity to be of type ${expectedType}, but got ${received?.type || 'undefined'}`,
        pass: false,
      };
    }
  },
  
  toHaveEntityAt(received: any[], offset: number, length: number, type?: string) {
    const entity = received.find(e => e.offset === offset && e.length === length);
    const pass = entity && (!type || entity.type === type);
    
    if (pass) {
      return {
        message: () => `expected not to have entity at offset ${offset} with length ${length}${type ? ` of type ${type}` : ''}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected to have entity at offset ${offset} with length ${length}${type ? ` of type ${type}` : ''}, but found: ${JSON.stringify(received)}`,
        pass: false,
      };
    }
  }
});

// Type augmentation for custom matchers
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeEntityType(expectedType: string): T;
  }
  
  interface AsymmetricMatchersContaining {
    toHaveEntityAt(offset: number, length: number, type?: string): any;
  }
}
