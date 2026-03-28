/**
 * @module core/ui-vue/injection-keys
 *
 * @description Ключи provide/inject для подстановки host-специфичных реализаций (иконки и т.д.)
 * без зависимости core от Obsidian.
 */

import type { Component, InjectionKey } from 'vue';

/**
 * @description Компонент отрисовки Lucide-иконки через host (например {@link setIcon} в Obsidian).
 */
export const HOST_LUCIDE_ICON: InjectionKey<Component> =
	Symbol('koraHostLucideIcon');

/**
 * @description Доп. поля для контекстного меню изображения (подсказка имени файла при сохранении в vault).
 */
export type HostImageContextMenuMeta = {
	suggestedFileName?: string | null;
};

/**
 * @description Host открывает нативное меню (например Obsidian {@code Menu}) по ПКМ на превью картинки.
 * @param {MouseEvent} event - Событие {@code contextmenu} (координаты для {@code showAtMouseEvent}).
 * @param {string} imageSrc - {@code src} изображения: {@code data:}, {@code http(s):} или иной URL, понятный host.
 * @param {HostImageContextMenuMeta} [meta] - Необязательные подсказки для пунктов меню.
 */
export type HostImageContextMenuFn = (
	event: MouseEvent,
	imageSrc: string,
	meta?: HostImageContextMenuMeta
) => void;

/**
 * @description Реализация контекстного меню для изображений; без provide остаётся системное меню браузера.
 */
export const HOST_IMAGE_CONTEXT_MENU: InjectionKey<
	HostImageContextMenuFn | undefined
> = Symbol('koraHostImageContextMenu');

/**
 * @description Данные для пункта «Удалить» в контекстном меню сообщения чата.
 */
export type HostChatMessageContextMenuPayload = {
	messageId: string;
	onDelete: () => void;
};

/**
 * @description Host открывает меню по ПКМ на пузыре сообщения (не на превью картинки).
 */
export type HostChatMessageContextMenuFn = (
	event: MouseEvent,
	payload: HostChatMessageContextMenuPayload
) => void;

export const HOST_CHAT_MESSAGE_CONTEXT_MENU: InjectionKey<
	HostChatMessageContextMenuFn | undefined
> = Symbol('koraHostChatMessageContextMenu');
