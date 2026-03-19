/**
 * @description TypeScript module declaration for Vue SFC files used in the plugin bundle.
 */
declare module '*.vue' {
	import type { DefineComponent } from 'vue';

	const component: DefineComponent<
		Record<string, unknown>,
		Record<string, unknown>,
		any
	>;
	export default component;
}
