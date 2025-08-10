import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['modules/note-chunker/__tests__/**/*.spec.ts'],
    exclude: ['gramjs-server/**', 'mcp-obsidian/**', 'node_modules/**', 'dist/**'],
  },
});


