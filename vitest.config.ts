import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['packages/kora-core/src/chunking/__tests__/**/*.spec.ts'],
		exclude: [
			'gramjs-server/**',
			'mcp-obsidian/**',
			'node_modules/**',
			'dist/**',
		],
		environment: 'node',
	},
});
