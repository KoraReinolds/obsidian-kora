/**
 * @module telegram/ui/archive-view
 *
 * @description Единый рабочий экран архива Telegram. Здесь пользователь вводит
 * `peer`, запускает синк, выбирает чат и читает сообщения без переходов между
 * командами, модалками и отдельными статусными сценариями.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type KoraPlugin from '../../../main';
import type { ArchiveChat, ArchiveMessage } from '../../../telegram-types';
import { ArchiveBridge } from '../transport/archive-bridge';

export const ARCHIVE_VIEW_TYPE = 'kora-telegram-archive';

type TArchiveViewMessageKind = 'neutral' | 'success' | 'error';

interface TArchiveViewMessage {
	kind: TArchiveViewMessageKind;
	text: string;
}

/**
 * @description Один экран архива: ввод `peer`, список чатов и лента сообщений выбранного чата.
 */
export class ArchiveView extends ItemView {
	private selectedChatId: string | null = null;
	private peerInputValue = '';
	private searchQuery = '';
	private chats: ArchiveChat[] = [];
	private selectedChatMessages: ArchiveMessage[] = [];
	private selectedChatTotal = 0;
	private isRefreshing = false;
	private isLoadingMessages = false;
	private isSyncing = false;
	private screenMessage: TArchiveViewMessage | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: KoraPlugin,
		private readonly archiveBridge: ArchiveBridge
	) {
		super(leaf);
	}

	getViewType(): string {
		return ARCHIVE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Архив Telegram';
	}

	getIcon(): string {
		return 'database';
	}

	async onOpen(): Promise<void> {
		if (!this.peerInputValue) {
			this.peerInputValue =
				this.plugin.settings.archiveSettings.defaultPeer || '';
		}

		this.render();
		await this.refreshData();
	}

	/**
	 * @description Полная перерисовка экрана из локального state без сетевых запросов внутри render.
	 * Сетевые действия идут через `refreshData`, `handleSync` и `handleChatSelection`.
	 * @returns {void}
	 */
	render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.style.height = '100%';

		const root = container.createDiv();
		root.style.cssText =
			'display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;padding-bottom:8px;';

		root.createEl('h3', { text: 'Архив Telegram' });
		this.renderToolbar(root);
		this.renderScreenMessage(root);
		this.renderLayout(root);
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv();
		toolbar.style.cssText =
			'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

		const peerInput = toolbar.createEl('input', {
			type: 'text',
			placeholder: '@channel или -1001234567890',
		});
		peerInput.value = this.peerInputValue;
		peerInput.style.cssText =
			'flex:1 1 280px;padding:8px 10px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);';
		peerInput.oninput = event => {
			this.peerInputValue = (event.target as HTMLInputElement).value;
		};
		peerInput.onkeydown = async event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				await this.handleSync();
			}
		};

		const syncButton = toolbar.createEl('button', {
			text: this.isSyncing ? 'Синхронизация…' : 'Синхронизировать',
			cls: 'mod-cta',
		});
		syncButton.disabled = this.isSyncing || this.isRefreshing;
		syncButton.onclick = async () => {
			await this.handleSync();
		};

		const refreshButton = toolbar.createEl('button', { text: 'Обновить' });
		refreshButton.disabled = this.isSyncing || this.isRefreshing;
		refreshButton.onclick = async () => {
			await this.refreshData();
		};
	}

	private renderScreenMessage(container: HTMLElement): void {
		if (!this.screenMessage) {
			return;
		}

		const colors: Record<TArchiveViewMessageKind, string> = {
			neutral: 'var(--background-secondary)',
			success:
				'color-mix(in srgb, var(--color-green) 16%, var(--background-secondary))',
			error:
				'color-mix(in srgb, var(--color-red) 16%, var(--background-secondary))',
		};

		const messageEl = container.createDiv({ text: this.screenMessage.text });
		messageEl.style.cssText = [
			'padding:10px 12px',
			'border-radius:8px',
			'border:1px solid var(--background-modifier-border)',
			`background:${colors[this.screenMessage.kind]}`,
		].join(';');
	}

	private renderLayout(container: HTMLElement): void {
		const layout = container.createDiv();
		layout.style.cssText =
			'display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr);gap:12px;flex:1;min-height:0;';

		this.renderChatsPane(layout);
		this.renderDetailsPane(layout);
	}

	private renderChatsPane(container: HTMLElement): void {
		const pane = container.createDiv();
		pane.style.cssText =
			'display:flex;flex-direction:column;gap:10px;min-height:0;padding:12px;border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);';

		pane.createEl('div', { text: 'Чаты' }).style.cssText =
			'font-weight:600;font-size:14px;';

		const searchInput = pane.createEl('input', {
			type: 'text',
			placeholder: 'Поиск по архивным чатам',
		});
		searchInput.value = this.searchQuery;
		searchInput.style.cssText =
			'padding:8px 10px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);';
		searchInput.oninput = event => {
			this.searchQuery = (event.target as HTMLInputElement).value;
			this.render();
		};

		const filteredChats = this.getFilteredChats();
		pane.createEl('div', {
			text: this.isRefreshing
				? 'Обновляем список чатов…'
				: `Архивных чатов: ${filteredChats.length}`,
		}).style.cssText = 'font-size:12px;color:var(--text-muted);';

		const list = pane.createDiv();
		list.style.cssText =
			'display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;';

		if (filteredChats.length === 0) {
			list.createEl('div', {
				text:
					this.chats.length === 0
						? 'Пока нет архивных чатов. Введите peer и выполните синхронизацию.'
						: 'По текущему поиску чаты не найдены.',
			}).style.cssText =
				'padding:10px;border:1px dashed var(--background-modifier-border);border-radius:8px;color:var(--text-muted);';
			return;
		}

		for (const chat of filteredChats) {
			list.appendChild(this.renderChatButton(chat));
		}
	}

	private renderDetailsPane(container: HTMLElement): void {
		const pane = container.createDiv();
		pane.style.cssText =
			'display:flex;flex-direction:column;gap:12px;min-height:0;padding:12px;border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);';

		const selectedChat = this.getSelectedChat();
		if (!selectedChat) {
			pane.createEl('div', { text: 'Ничего не выбрано' }).style.cssText =
				'font-weight:600;font-size:14px;';
			pane.createEl('div', {
				text: 'Синхронизируйте новый peer или выберите чат слева.',
			}).style.cssText = 'color:var(--text-muted);';
			return;
		}

		const header = pane.createDiv();
		header.style.cssText =
			'display:flex;justify-content:space-between;gap:12px;align-items:flex-start;';

		const titleBlock = header.createDiv();
		titleBlock.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
		titleBlock.createEl('div', { text: selectedChat.title }).style.cssText =
			'font-weight:600;font-size:16px;';

		if (selectedChat.username) {
			titleBlock.createEl('div', {
				text: `@${selectedChat.username.replace(/^@/, '')}`,
			}).style.cssText = 'font-size:12px;color:var(--text-muted);';
		}

		const summary = pane.createDiv();
		summary.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
		this.renderSummaryChip(summary, `Сообщений: ${selectedChat.messageCount}`);
		this.renderSummaryChip(
			summary,
			`Последний синк: ${this.formatDate(selectedChat.lastSyncedAt)}`
		);
		this.renderSummaryChip(
			summary,
			`Показано: ${this.selectedChatMessages.length}`
		);

		const messagesHeader = pane.createDiv();
		messagesHeader.style.cssText =
			'display:flex;justify-content:space-between;gap:12px;align-items:center;';
		messagesHeader.createEl('div', { text: 'Сообщения' }).style.cssText =
			'font-weight:600;font-size:14px;';
		messagesHeader.createEl('div', {
			text: this.isLoadingMessages
				? 'Загрузка…'
				: `Всего в архиве: ${this.selectedChatTotal}`,
		}).style.cssText = 'font-size:12px;color:var(--text-muted);';

		const list = pane.createDiv();
		list.style.cssText =
			'display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0;';

		if (this.isLoadingMessages) {
			list.createEl('div', { text: 'Загружаем сообщения…' }).style.cssText =
				'color:var(--text-muted);';
			return;
		}

		if (this.selectedChatMessages.length === 0) {
			list.createEl('div', {
				text: 'В этом чате пока нет архивных сообщений.',
			}).style.cssText =
				'padding:10px;border:1px dashed var(--background-modifier-border);border-radius:8px;color:var(--text-muted);';
			return;
		}

		for (const message of this.selectedChatMessages) {
			list.appendChild(this.renderMessageCard(message));
		}
	}

	private renderSummaryChip(container: HTMLElement, text: string): void {
		container.createEl('div', { text }).style.cssText = [
			'padding:4px 8px',
			'border-radius:999px',
			'font-size:12px',
			'border:1px solid var(--background-modifier-border)',
			'background:var(--background-primary)',
		].join(';');
	}

	private renderChatButton(chat: ArchiveChat): HTMLElement {
		const button = document.createElement('button');
		button.style.cssText = [
			'display:flex',
			'flex-direction:column',
			'gap:4px',
			'padding:10px',
			'text-align:left',
			'border-radius:8px',
			'background:var(--background-primary)',
			`border:${this.selectedChatId === chat.chatId ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)'}`,
		].join(';');

		const title = document.createElement('div');
		title.textContent = chat.title;
		title.style.cssText = 'font-weight:600;';
		button.appendChild(title);

		const meta = document.createElement('div');
		meta.textContent = `${chat.messageCount} сообщений • ${this.formatDate(
			chat.lastSyncedAt
		)}`;
		meta.style.cssText = 'font-size:12px;color:var(--text-muted);';
		button.appendChild(meta);

		if (chat.username) {
			const username = document.createElement('div');
			username.textContent = `@${chat.username.replace(/^@/, '')}`;
			username.style.cssText = 'font-size:12px;color:var(--text-muted);';
			button.appendChild(username);
		}

		button.onclick = async () => {
			await this.handleChatSelection(chat.chatId);
		};

		return button;
	}

	private renderMessageCard(message: ArchiveMessage): HTMLElement {
		const card = document.createElement('div');
		card.style.cssText =
			'padding:10px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-primary);';

		const meta = document.createElement('div');
		meta.textContent = `#${message.messageId} • ${new Date(
			message.timestampUtc
		).toLocaleString()}`;
		meta.style.cssText =
			'font-size:12px;color:var(--text-muted);margin-bottom:6px;';
		card.appendChild(meta);

		const body = document.createElement('div');
		body.textContent =
			message.textNormalized ||
			message.textRaw ||
			'[сообщение без текстового содержимого]';
		body.style.whiteSpace = 'pre-wrap';
		card.appendChild(body);

		return card;
	}

	private async refreshData(): Promise<void> {
		this.isRefreshing = true;
		this.render();

		try {
			await this.loadChats();
			await this.loadSelectedChatMessages();
		} catch (error) {
			this.screenMessage = {
				kind: 'error',
				text: `Не удалось обновить архив: ${(error as Error).message}`,
			};
		} finally {
			this.isRefreshing = false;
			this.render();
		}
	}

	private async handleSync(): Promise<void> {
		const peer = this.peerInputValue.trim();
		if (!peer) {
			this.screenMessage = {
				kind: 'error',
				text: 'Введите peer чата или канала перед синхронизацией.',
			};
			this.render();
			return;
		}

		this.isSyncing = true;
		this.screenMessage = {
			kind: 'neutral',
			text: `Синхронизируем ${peer}…`,
		};
		this.render();

		try {
			const result = await this.archiveBridge.syncArchive({
				peer,
				limit: this.plugin.settings.archiveSettings.defaultSyncLimit,
			});

			await this.loadChats();
			this.selectedChatId = result.chatId || this.selectedChatId;
			await this.loadSelectedChatMessages();
			this.screenMessage = {
				kind: 'success',
				text: this.buildSyncMessage(result),
			};
		} catch (error) {
			this.screenMessage = {
				kind: 'error',
				text: `Синхронизация не удалась: ${(error as Error).message}`,
			};
		} finally {
			this.isSyncing = false;
			this.render();
		}
	}

	private async handleChatSelection(chatId: string): Promise<void> {
		if (this.selectedChatId === chatId) {
			return;
		}

		this.selectedChatId = chatId;
		this.isLoadingMessages = true;
		this.render();

		try {
			await this.loadSelectedChatMessages();
		} catch (error) {
			this.screenMessage = {
				kind: 'error',
				text: `Не удалось загрузить сообщения: ${(error as Error).message}`,
			};
		} finally {
			this.isLoadingMessages = false;
			this.render();
		}
	}

	private async loadChats(): Promise<void> {
		this.chats = await this.archiveBridge.getArchivedChats(200);

		if (
			this.selectedChatId &&
			!this.chats.some(chat => chat.chatId === this.selectedChatId)
		) {
			this.selectedChatId = null;
		}

		if (!this.selectedChatId && this.chats.length > 0) {
			this.selectedChatId = this.chats[0].chatId;
		}
	}

	private async loadSelectedChatMessages(): Promise<void> {
		if (!this.selectedChatId) {
			this.selectedChatMessages = [];
			this.selectedChatTotal = 0;
			return;
		}

		this.isLoadingMessages = true;
		try {
			const response = await this.archiveBridge.getArchivedMessages({
				chatId: this.selectedChatId,
				limit: this.plugin.settings.archiveSettings.recentMessagesLimit,
				offset: 0,
			});
			this.selectedChatMessages = response.messages;
			this.selectedChatTotal = response.total;
		} finally {
			this.isLoadingMessages = false;
		}
	}

	private getSelectedChat(): ArchiveChat | null {
		return this.chats.find(chat => chat.chatId === this.selectedChatId) || null;
	}

	private getFilteredChats(): ArchiveChat[] {
		const query = this.searchQuery.trim().toLowerCase();
		if (!query) {
			return this.chats;
		}

		return this.chats.filter(chat =>
			[chat.title, chat.username, chat.chatId]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(query)
		);
	}

	private buildSyncMessage(result: {
		inserted: number;
		updated: number;
		skipped: number;
		totalProcessed: number;
	}): string {
		if (result.totalProcessed === 0) {
			return 'Синк завершён: новых сообщений не найдено.';
		}

		return `Синк завершён: добавлено ${result.inserted}, обновлено ${result.updated}, без изменений ${result.skipped}.`;
	}

	private formatDate(value?: string | null): string {
		if (!value) {
			return 'ещё не было';
		}

		return new Date(value).toLocaleString();
	}
}
