/**
 * @module hosts/obsidian/vue-host
 *
 * @description Host adapter для монтирования/размонтирования Vue приложения
 * внутри контейнера Obsidian ItemView.
 */

import { createApp, type App, type Component } from 'vue';

/**
 * @description Монтирует Vue-компонент в указанный DOM контейнер.
 * @template TProps
 * @param {HTMLElement} container - DOM-узел для mount.
 * @param {Component} component - Корневой Vue компонент.
 * @param {TProps} props - Props для корневого компонента.
 * @returns {App} Экземпляр Vue приложения для последующего unmount.
 */
export function mountVueInObsidian<TProps>(
	container: HTMLElement,
	component: Component,
	props: TProps
): App {
	const app = createApp(component, (props as Record<string, unknown>) || {});
	app.mount(container);
	return app;
}

/**
 * @description Размонтирует ранее смонтированное Vue приложение.
 * @param {App | null} app - Экземпляр Vue приложения.
 * @returns {void}
 */
export function unmountVueInObsidian(app: App | null): void {
	app?.unmount();
}
