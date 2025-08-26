import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'modules/chunking/__tests__/**/*.spec.ts',
			'modules/telegram/__tests__/**/*.{test,spec}.ts',
		],
		exclude: [
			'gramjs-server/**',
			'mcp-obsidian/**',
			'node_modules/**',
			'dist/**',
		],
		environment: 'node',
		setupFiles: ['modules/telegram/__tests__/setup.ts'],
	},
});
