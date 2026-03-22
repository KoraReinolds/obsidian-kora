import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../../main';

export class VectorSettingTab extends PluginSettingTab {
	private plugin: KoraPlugin;
	private id: string;
	private name: string;

	constructor(app: App, plugin: KoraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.id = 'kora-vector-settings';
		this.name = '- Kora: Vector';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Vector Search Settings' });
		containerEl.createEl('p', {
			text: 'Configure the SQLite semantic index and the OpenAI-compatible embeddings endpoint used for indexing.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Enable vectorization')
			.setDesc('Enable AI-powered vector search for posts and notes')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.vectorSettings.enableVectorization)
					.onChange(async value => {
						this.plugin.settings.vectorSettings.enableVectorization = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (!this.plugin.settings.vectorSettings.enableVectorization) {
			containerEl.createEl('div', {
				text: 'Vector search is disabled. Enable it above to configure settings.',
				cls: 'setting-item-description',
			});
			return;
		}

		new Setting(containerEl)
			.setName('SQLite database path')
			.setDesc('Path to semantic index SQLite file on the GramJS server host.')
			.addText(text =>
				text
					.setPlaceholder('data/semantic-index.sqlite')
					.setValue(this.plugin.settings.vectorSettings.semanticDatabasePath)
					.onChange(async value => {
						this.plugin.settings.vectorSettings.semanticDatabasePath = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl('h3', { text: 'Embeddings Provider' });
		new Setting(containerEl)
			.setName('OpenRouter API Key')
			.setDesc(
				'API key for the OpenAI-compatible embeddings endpoint. OpenRouter keys usually start with sk-or-v1-.'
			)
			.addText(text =>
				text
					.setPlaceholder('sk-or-v1-...')
					.setValue(this.plugin.settings.vectorSettings.openaiApiKey)
					.onChange(async value => {
						this.plugin.settings.vectorSettings.openaiApiKey = value;
						await this.plugin.saveSettings();
					})
			);

		const apiKeyInput = containerEl.querySelector(
			'input[placeholder="sk-or-v1-..."]'
		) as HTMLInputElement;
		if (apiKeyInput) apiKeyInput.type = 'password';

		new Setting(containerEl)
			.setName('Embeddings endpoint')
			.setDesc(
				'Base URL for an OpenAI-compatible embeddings API. Default points to OpenRouter.'
			)
			.addText(text =>
				text
					.setPlaceholder('https://openrouter.ai/api/v1')
					.setValue(this.plugin.settings.vectorSettings.embeddingBaseUrl)
					.onChange(async value => {
						this.plugin.settings.vectorSettings.embeddingBaseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Embedding model')
			.setDesc(
				'Model id for the configured embeddings endpoint. Plain OpenAI ids are auto-prefixed for OpenRouter.'
			)
			.addDropdown(dropdown =>
				dropdown
					.addOption(
						'text-embedding-3-small',
						'text-embedding-3-small -> openai/text-embedding-3-small (1536 dims)'
					)
					.addOption(
						'text-embedding-3-large',
						'text-embedding-3-large -> openai/text-embedding-3-large (3072 dims)'
					)
					.addOption(
						'text-embedding-ada-002',
						'text-embedding-ada-002 -> openai/text-embedding-ada-002 (legacy)'
					)
					.setValue(this.plugin.settings.vectorSettings.embeddingModel)
					.onChange(async value => {
						this.plugin.settings.vectorSettings.embeddingModel = value;
						this.plugin.settings.vectorSettings.vectorDimensions =
							value === 'text-embedding-3-large' ? 3072 : 1536;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName('Vector dimensions')
			.setDesc('Number of dimensions for embeddings (auto-set based on model)')
			.addText(text =>
				text
					.setValue(
						this.plugin.settings.vectorSettings.vectorDimensions.toString()
					)
					.setDisabled(true)
			);

		containerEl.createEl('h3', { text: 'Connection Test' });
		const testContainer = containerEl.createDiv('vector-test-container');
		new Setting(testContainer)
			.setName('Test vector services')
			.setDesc('Test SQLite semantic storage and embeddings configuration')
			.addButton(button =>
				button
					.setButtonText('Test Connection')
					.setCta()
					.onClick(async () => {
						await this.testVectorServices(button.buttonEl);
					})
			);

		containerEl.createEl('h3', { text: 'Environment Variables' });
		const envHelp = containerEl.createDiv('vector-env-help');
		envHelp.createEl('p', {
			text: 'You can also set these environment variables in the GramJS server:',
		});
		envHelp.createEl('ul').innerHTML = `
		  <li><code>SEMANTIC_DB_PATH</code> - SQLite path for semantic backend</li>
		  <li><code>OPENROUTER_API_KEY</code> or <code>OPENAI_API_KEY</code> - embeddings API key</li>
		  <li><code>OPENROUTER_BASE_URL</code> or <code>OPENAI_BASE_URL</code> - embeddings endpoint base URL</li>
		  <li><code>EMBEDDING_MODEL</code> - embeddings model id</li>
		`;
	}

	private async testVectorServices(buttonEl: HTMLElement): Promise<void> {
		const originalText = buttonEl.textContent;
		buttonEl.textContent = 'Testing...';
		buttonEl.setAttribute('disabled', 'true');
		try {
			const response = await fetch('http://127.0.0.1:8124/vector_health');
			const healthData = await response.json();
			if (healthData.status === 'healthy') {
				buttonEl.textContent = 'вњ… Connected';
				buttonEl.setAttribute('style', 'background-color:#4ade80;');
				const infoEl = buttonEl.parentElement?.createDiv('vector-test-result');
				if (infoEl) {
					infoEl.innerHTML = `
					  <div style="margin-top: 8px; padding: 8px; background: #f0f9ff; border-radius: 4px;">
					    <strong>Vector Service Status:</strong> ${healthData.status}<br>
					    <strong>Backend:</strong> ${healthData.backend || 'sqlite'}<br>
					    <strong>SQLite DB:</strong> ${healthData.databasePath || 'n/a'}<br>
					    <strong>Embeddings Endpoint:</strong> ${healthData.embeddingBaseUrl || 'n/a'}<br>
					    <strong>Embeddings Model:</strong> ${healthData.embeddingModel || 'n/a'}<br>
					    <strong>Total Points:</strong> ${healthData.stats?.totalPoints || 0}
					  </div>
					`;
				}
			} else {
				throw new Error(healthData.error || 'Vector service unhealthy');
			}
		} catch (error) {
			buttonEl.textContent = 'вќЊ Failed';
			buttonEl.setAttribute('style', 'background-color:#ef4444;');
			const errorEl = buttonEl.parentElement?.createDiv('vector-test-error');
			if (errorEl) {
				errorEl.innerHTML = `
				  <div style="margin-top: 8px; padding: 8px; background: #fef2f2; border-radius: 4px; color: #dc2626;">
				    <strong>Error:</strong> ${(error as Error).message}<br>
				    <small>Make sure GramJS server is running and the SQLite semantic backend is configured correctly.</small>
				  </div>
				`;
			}
		} finally {
			setTimeout(() => {
				buttonEl.textContent = originalText;
				buttonEl.removeAttribute('disabled');
				buttonEl.removeAttribute('style');
				const resultEl = buttonEl.parentElement?.querySelector(
					'.vector-test-result'
				);
				const errorEl =
					buttonEl.parentElement?.querySelector('.vector-test-error');
				resultEl?.remove();
				errorEl?.remove();
			}, 3000);
		}
	}
}
