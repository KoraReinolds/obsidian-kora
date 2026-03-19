/**
 * @module hosts/web/create-web-entry
 *
 * @description Web host entry helper для VitePress/Nuxt Content:
 * позволяет монтировать те же feature-компоненты в браузерный контейнер.
 */

import { createApp, type Component } from 'vue';

/**
 * @description Создает web entrypoint для любого feature-компонента.
 * @template TProps
 * @param {HTMLElement} container - DOM контейнер для mount.
 * @param {Component} root - Корневой компонент feature.
 * @param {TProps} props - Props корневого компонента.
 * @returns {() => void} Функция unmount.
 */
export function createWebEntry<TProps>(
	container: HTMLElement,
	root: Component,
	props: TProps
): () => void {
	const app = createApp(root, (props as Record<string, unknown>) || {});
	app.mount(container);
	return () => app.unmount();
}
