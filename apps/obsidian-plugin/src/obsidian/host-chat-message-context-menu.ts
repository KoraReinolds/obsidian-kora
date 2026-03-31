/**
 * @module obsidian-plugin/obsidian/host-chat-message-context-menu
 * @description Контекстное меню Obsidian для bubble в ленте чата: копирование и удаление.
 */

import type { App as ObsidianApp } from 'obsidian';
import { Menu } from 'obsidian';
import type { HostChatMessageContextMenuFn } from '../ui-vue/injection-keys';

async function copyToClipboard(text: string): Promise<void> {
	if (!text) {
		return;
	}
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}
	// Fallback: deprecated but works in older WebViews
	const el = document.createElement('textarea');
	el.value = text;
	el.style.position = 'fixed';
	el.style.opacity = '0';
	document.body.appendChild(el);
	el.focus();
	el.select();
	document.execCommand('copy');
	document.body.removeChild(el);
}

function getSelectionText(): string {
	try {
		return window.getSelection?.()?.toString?.() || '';
	} catch {
		return '';
	}
}

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
		const selection = getSelectionText().trim();
		const copyText = (payload.copyText || '').trim();

		menu.addItem(item => {
			item.setTitle('Скопировать выделенное');
			item.setDisabled(!selection);
			item.onClick(() => {
				void copyToClipboard(selection);
			});
		});
		menu.addItem(item => {
			item.setTitle('Скопировать всё');
			item.setDisabled(!copyText);
			item.onClick(() => {
				void copyToClipboard(copyText);
			});
		});
		menu.addSeparator();
		menu.addItem(item => {
			item.setTitle(payload.hasTurn ? 'Удалить turn' : 'Удалить сообщение');
			item.setWarning(true);
			item.onClick(() => {
				payload.onDelete();
			});
		});
		menu.showAtMouseEvent(event);
	};
}
