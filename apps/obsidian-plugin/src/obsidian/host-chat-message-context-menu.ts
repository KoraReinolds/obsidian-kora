/**
 * @module obsidian-plugin/obsidian/host-chat-message-context-menu
 * @description Контекстное меню Obsidian для сообщения в ленте чата: удаление.
 */

import type { App as ObsidianApp } from 'obsidian';
import { Menu } from 'obsidian';
import type { HostChatMessageContextMenuFn } from '../ui-vue/injection-keys';

/**
 * @description Фабрика обработчика ПКМ по пузырю сообщения ({@code ChatMessageBubble}).
 * @param {ObsidianApp} _app - Зарезервировано под будущие действия (Notice и т.п.).
 * @returns {HostChatMessageContextMenuFn}
 */
export function createHostChatMessageContextMenuHandler(
	_app: ObsidianApp
): HostChatMessageContextMenuFn {
	return (event: MouseEvent, payload): void => {
		const menu = new Menu();
		menu.addItem(item => {
			item.setTitle('Удалить сообщение');
			item.setWarning(true);
			item.onClick(() => {
				payload.onDelete();
			});
		});
		menu.showAtMouseEvent(event);
	};
}
