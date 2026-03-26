import { spawn } from 'child_process';

const child = spawn('yarn', ['workspace', '@kora/server', 'dev:dual'], {
	stdio: 'inherit',
	shell: true,
});

child.on('exit', code => {
	process.exit(code ?? 0);
});

child.on('error', error => {
	console.error(
		'[kora] Failed to start kora-server workspace dev runtime:',
		error
	);
	process.exit(1);
});
