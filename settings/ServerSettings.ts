/**
 * ServerSettings.ts
 *
 * Provides UI for MCP server settings (e.g., port).
 * Only contains logic for server-related settings.
 */
import { Setting } from "obsidian";

/**
 * Render the server settings section in the settings tab.
 * @param {HTMLElement} containerEl - The container element to render into.
 * @param {any} plugin - The plugin instance containing settings and saveSettings().
 */
export function renderServerSettings(containerEl: HTMLElement, plugin: any): void {
	containerEl.createEl('h2', { text: 'MCP Server Settings' });

	new Setting(containerEl)
		.setName('Server Port')
		.setDesc('The port for the MCP server to listen on. The server needs to be restarted for changes to take effect.')
		.addText((text) =>
			text
				.setPlaceholder('Enter port')
				.setValue(plugin.settings.port.toString())
				.onChange(async (value) => {
					const port = parseInt(value, 10);
					if (!isNaN(port) && port > 0 && port < 65536) {
						plugin.settings.port = port;
						await plugin.saveSettings();
					}
				})
		);
} 