/**
 * @module hosts/obsidian/vue-host
 *
 * @description Host adapter для монтирования/размонтирования Vue приложения
 * внутри контейнера Obsidian ItemView.
 */

import type { App, Component } from 'vue';
import { createApp } from 'vue';
import { HOST_LUCIDE_ICON } from '../ui-vue/injection-keys';

/**
 * @description Опции монтирования: подстановка host-компонентов через provide.
 */
export interface MountVueInObsidianOptions {
	/** Реализация Lucide через Obsidian `setIcon` для inject в core {@link UiHostIcon}. */
	hostLucideIcon?: Component;
}

/**
 * @description Монтирует Vue-компонент в указанный DOM контейнер.
 * @template TProps
 * @param {HTMLElement} container - DOM-узел для mount.
 * @param {Component} component - Корневой Vue компонент.
 * @param {TProps} props - Props для корневого компонента.
 * @param {MountVueInObsidianOptions} [options] - Provide для host-адаптеров.
 * @returns {App} Экземпляр Vue приложения для последующего unmount.
 */
export function mountVueInObsidian<TProps>(
	container: HTMLElement,
	component: Component,
	props: TProps,
	options?: MountVueInObsidianOptions
): App {
	const app = createApp(component, (props as Record<string, unknown>) || {});
	if (options?.hostLucideIcon) {
		app.provide(HOST_LUCIDE_ICON, options.hostLucideIcon);
	}
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
