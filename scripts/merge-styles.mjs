/**
 * @description One-off merge of styles.base + Tailwind (PostCSS) + main.css into styles.css.
 * Used to verify paths; esbuild.config.mjs should mirror this logic.
 */
import { readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import postcss from 'postcss';
import tailwindPostcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const baseStylesPath = join(projectRoot, 'styles.base.css');
const componentStylesPath = join(projectRoot, 'main.css');
const tailwindEntryPath = join(
	projectRoot,
	'modules/core/ui-vue/styles/tailwind.css'
);
const outputStylesPath = join(projectRoot, 'styles.css');

async function compileTailwindCss() {
	const input = await readFile(tailwindEntryPath, 'utf8');
	const result = await postcss([tailwindPostcss, autoprefixer]).process(input, {
		from: tailwindEntryPath,
	});
	return result.css;
}

const base = await readFile(baseStylesPath, 'utf8');
let componentCss = '';
try {
	componentCss = await readFile(componentStylesPath, 'utf8');
} catch {
	componentCss = '';
}

const tailwindCss = await compileTailwindCss();

const banner = `/*
Generated file.
Do not edit manually: run build/dev to regenerate from styles.base.css + tailwind + main.css
*/

`;

const chunks = [banner, base.trim()];
if (tailwindCss.trim()) {
	chunks.push('\n\n/* Tailwind (PostCSS) */\n', tailwindCss.trim());
}
if (componentCss.trim()) {
	chunks.push('\n\n/* Vue SFC compiled styles */\n', componentCss.trim());
}
await writeFile(outputStylesPath, chunks.join(''), 'utf8');
console.log('Wrote', outputStylesPath, 'tailwind bytes', tailwindCss.length);
