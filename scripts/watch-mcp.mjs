import esbuild from 'esbuild';

const ctx = await esbuild.context({
	entryPoints: ['mcp-server.ts'],
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node20',
	outfile: 'build/mcp-server.js',
	sourcemap: 'inline',
	logLevel: 'info',
});

await ctx.watch();
console.log('[kora] MCP build watcher started');
