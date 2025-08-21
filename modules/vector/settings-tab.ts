import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraMcpPlugin from '../../main';

export class VectorSettingTab extends PluginSettingTab {
	private plugin: KoraMcpPlugin;

	constructor(app: App, plugin: KoraMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// @ts-ignore
		this.id = 'kora-vector-settings';
		// @ts-ignore
		this.name = '- Kora: Vector';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Vector Search Settings' });
		containerEl.createEl('p', { text: 'Configure vector search and AI embeddings for content indexing and semantic search.', cls: 'setting-item-description' });

		new Setting(containerEl)
			.setName('Enable vectorization')
			.setDesc('Enable AI-powered vector search for posts and notes')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.vectorSettings.enableVectorization)
				.onChange(async (value) => {
					this.plugin.settings.vectorSettings.enableVectorization = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (!this.plugin.settings.vectorSettings.enableVectorization) {
			containerEl.createEl('div', { text: 'Vector search is disabled. Enable it above to configure settings.', cls: 'setting-item-description' });
			return;
		}

		containerEl.createEl('h3', { text: 'Qdrant Vector Database' });
		new Setting(containerEl)
			.setName('Qdrant URL')
			.setDesc('URL of your Qdrant vector database instance')
			.addText(text => text
				.setPlaceholder('http://localhost:6333')
				.setValue(this.plugin.settings.vectorSettings.qdrantUrl)
				.onChange(async (value) => { this.plugin.settings.vectorSettings.qdrantUrl = value; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName('Collection name')
			.setDesc('Name of the Qdrant collection to store vectors')
			.addText(text => text
				.setPlaceholder('kora_content')
				.setValue(this.plugin.settings.vectorSettings.qdrantCollection)
				.onChange(async (value) => { this.plugin.settings.vectorSettings.qdrantCollection = value; await this.plugin.saveSettings(); }));

		containerEl.createEl('h3', { text: 'OpenAI Embeddings' });
		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('Your OpenAI API key for generating embeddings')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.vectorSettings.openaiApiKey)
				.onChange(async (value) => { this.plugin.settings.vectorSettings.openaiApiKey = value; await this.plugin.saveSettings(); }));

		const apiKeyInput = containerEl.querySelector('input[placeholder="sk-..."]') as HTMLInputElement;
		if (apiKeyInput) apiKeyInput.type = 'password';

		new Setting(containerEl)
			.setName('Embedding model')
			.setDesc('OpenAI model to use for generating embeddings')
			.addDropdown(dropdown => dropdown
				.addOption('text-embedding-3-small', 'text-embedding-3-small (1536 dims, cheaper)')
				.addOption('text-embedding-3-large', 'text-embedding-3-large (3072 dims, better quality)')
				.addOption('text-embedding-ada-002', 'text-embedding-ada-002 (1536 dims, legacy)')
				.setValue(this.plugin.settings.vectorSettings.embeddingModel)
				.onChange(async (value) => {
					this.plugin.settings.vectorSettings.embeddingModel = value;
					this.plugin.settings.vectorSettings.vectorDimensions = value === 'text-embedding-3-large' ? 3072 : 1536;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName('Vector dimensions')
			.setDesc('Number of dimensions for embeddings (auto-set based on model)')
			.addText(text => text.setValue(this.plugin.settings.vectorSettings.vectorDimensions.toString()).setDisabled(true));

		containerEl.createEl('h3', { text: 'Connection Test' });
		const testContainer = containerEl.createDiv('vector-test-container');
		new Setting(testContainer)
			.setName('Test vector services')
			.setDesc('Test connection to Qdrant and OpenAI services')
			.addButton(button => button.setButtonText('Test Connection').setCta().onClick(async () => { await this.testVectorServices(button.buttonEl); }));

		containerEl.createEl('h3', { text: 'Environment Variables' });
		const envHelp = containerEl.createDiv('vector-env-help');
		envHelp.createEl('p', { text: 'You can also set these environment variables in the GramJS server:' });
		envHelp.createEl('ul').innerHTML = `
		  <li><code>QDRANT_URL</code> - Qdrant database URL</li>
		  <li><code>QDRANT_COLLECTION</code> - Collection name</li>
		  <li><code>OPENAI_API_KEY</code> - OpenAI API key</li>
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
				buttonEl.textContent = '✅ Connected';
				buttonEl.setAttribute('style', 'background-color:#4ade80;');
				const infoEl = buttonEl.parentElement?.createDiv('vector-test-result');
				if (infoEl) {
					infoEl.innerHTML = `
					  <div style="margin-top: 8px; padding: 8px; background: #f0f9ff; border-radius: 4px;">
					    <strong>Vector Service Status:</strong> ${healthData.status}<br>
					    <strong>Qdrant URL:</strong> ${healthData.qdrantUrl}<br>
					    <strong>Collection:</strong> ${healthData.collection}<br>
					    <strong>Total Points:</strong> ${healthData.stats?.totalPoints || 0}
					  </div>
					`;
				}
			} else {
				throw new Error(healthData.error || 'Vector service unhealthy');
			}
		} catch (error) {
			buttonEl.textContent = '❌ Failed';
			buttonEl.setAttribute('style', 'background-color:#ef4444;');
			const errorEl = buttonEl.parentElement?.createDiv('vector-test-error');
			if (errorEl) {
				errorEl.innerHTML = `
				  <div style="margin-top: 8px; padding: 8px; background: #fef2f2; border-radius: 4px; color: #dc2626;">
				    <strong>Error:</strong> ${(error as Error).message}<br>
				    <small>Make sure Qdrant is running on port 6333 and GramJS server is running with vector services enabled.</small>
				  </div>
				`;
			}
		} finally {
			setTimeout(() => {
				buttonEl.textContent = originalText;
				buttonEl.removeAttribute('disabled');
				buttonEl.removeAttribute('style');
				const resultEl = buttonEl.parentElement?.querySelector('.vector-test-result');
				const errorEl = buttonEl.parentElement?.querySelector('.vector-test-error');
				resultEl?.remove();
				errorEl?.remove();
			}, 3000);
		}
	}
}


