import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../main';

export class EternalAiSettingTab extends PluginSettingTab {
	private plugin: KoraPlugin;
	private id: string;
	private name: string;

	constructor(app: App, plugin: KoraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.id = 'kora-eternal-ai-settings';
		this.name = '- Kora: Eternal AI';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Eternal AI Settings' });
		containerEl.createEl('p', {
			text: 'Configure the OpenAI-compatible Eternal AI endpoint and the local SQLite history used by the Obsidian chat screen.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Enable Eternal AI screen')
			.setDesc(
				'Shows the dedicated Eternal AI view and syncs its config to Kora server.'
			)
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.eternalAiSettings.enableEternalAi)
					.onChange(async value => {
						this.plugin.settings.eternalAiSettings.enableEternalAi = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (!this.plugin.settings.eternalAiSettings.enableEternalAi) {
			containerEl.createEl('div', {
				text: 'Eternal AI screen is disabled. Enable it above to configure the provider.',
				cls: 'setting-item-description',
			});
			return;
		}

		new Setting(containerEl)
			.setName('SQLite database path')
			.setDesc(
				'Path to the local Eternal AI history SQLite file on the Kora server host.'
			)
			.addText(text =>
				text
					.setPlaceholder('data/eternal-ai-chat.sqlite')
					.setValue(this.plugin.settings.eternalAiSettings.databasePath)
					.onChange(async value => {
						this.plugin.settings.eternalAiSettings.databasePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('API key')
			.setDesc(
				'Eternal AI API key used by Kora server. Sent in the x-api-key header.'
			)
			.addText(text =>
				text
					.setPlaceholder('eternal-ai-api-key')
					.setValue(this.plugin.settings.eternalAiSettings.apiKey)
					.onChange(async value => {
						this.plugin.settings.eternalAiSettings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		const apiKeyInput = containerEl.querySelector(
			'input[placeholder="eternal-ai-api-key"]'
		) as HTMLInputElement | null;
		if (apiKeyInput) {
			apiKeyInput.type = 'password';
		}

		new Setting(containerEl)
			.setName('Base URL')
			.setDesc('OpenAI-compatible Eternal AI base URL.')
			.addText(text =>
				text
					.setPlaceholder('https://open.eternalai.org/v1')
					.setValue(this.plugin.settings.eternalAiSettings.baseUrl)
					.onChange(async value => {
						this.plugin.settings.eternalAiSettings.baseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Model id')
			.setDesc('Default model id sent to Eternal AI chat completions.')
			.addText(text =>
				text
					.setPlaceholder('uncensored-eternal-ai-1.0')
					.setValue(this.plugin.settings.eternalAiSettings.model)
					.onChange(async value => {
						this.plugin.settings.eternalAiSettings.model = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Default system prompt')
			.setDesc('Applied only when a new Eternal AI conversation starts.')
			.addTextArea(text =>
				text
					.setPlaceholder('Опишите роль ассистента или стиль ответа')
					.setValue(this.plugin.settings.eternalAiSettings.defaultSystemPrompt)
					.onChange(async value => {
						this.plugin.settings.eternalAiSettings.defaultSystemPrompt = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
