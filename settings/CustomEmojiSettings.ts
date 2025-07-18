/**
 * CustomEmojiSettings.ts
 *
 * Provides UI for custom emoji mappings used by GramJS userbot.
 * Contains logic for managing custom emoji mappings.
 */
import { Setting } from "obsidian";

/**
 * Render the custom emoji mapping settings section in the settings tab.
 * @param {HTMLElement} containerEl - The container element to render into.
 * @param {any} plugin - The plugin instance containing settings and saveSettings().
 */
export function renderCustomEmojiSettings(containerEl: HTMLElement, plugin: any): void {
	containerEl.createEl('h3', { text: 'Custom Emojis' });

	new Setting(containerEl)
		.setName('Enable Custom Emojis')
		.setDesc('Replace standard emojis with custom ones from your packs')
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.telegram.useCustomEmojis || false)
				.onChange(async (value) => {
					plugin.settings.telegram.useCustomEmojis = value;
					await plugin.saveSettings();
					plugin.settingsTab.display(); // Re-render settings
				})
		);

	if (plugin.settings.telegram.useCustomEmojis) {
		const mappings = plugin.settings.telegram.customEmojis || [];

		// Description for how to get custom_emoji_id
		const descEl = containerEl.createEl('div', {
			cls: 'setting-item-description',
			text: 'To get custom_emoji_id: send a custom emoji to @userinfobot, it will reply with JSON containing custom_emoji_id.'
		});
		descEl.style.marginBottom = '15px';
		descEl.style.fontStyle = 'italic';

		// Show existing mappings
		mappings.forEach((mapping: any) => {
			const setting = new Setting(containerEl)
				.setName(`${mapping.standard} → Custom`)
				.setDesc(mapping.description || `Mapping for emoji ${mapping.standard}`)
				.addButton((button) =>
					button
						.setButtonText('Remove')
						.setWarning()
						.onClick(async () => {
							// Remove mapping from settings
							if (plugin.settings.telegram.customEmojis) {
								plugin.settings.telegram.customEmojis = plugin.settings.telegram.customEmojis.filter(
									(m: any) => m.standard !== mapping.standard
								);
							}
							await plugin.saveSettings();
							plugin.settingsTab.display();
						})
				);

			const customIdEl = setting.settingEl.createEl('div', {
				text: `ID: ${mapping.customId}`,
				cls: 'setting-item-description'
			});
			customIdEl.style.marginTop = '5px';
			customIdEl.style.fontFamily = 'monospace';
			customIdEl.style.fontSize = '12px';
		});

		// Form to add new mapping
		const addContainer = containerEl.createEl('div', { cls: 'setting-item' });
		addContainer.createEl('h4', { text: 'Add New Mapping' });

		let newStandardEmoji = '';
		let newCustomId = '';
		let newDescription = '';

		new Setting(addContainer)
			.setName('Standard Emoji')
			.setDesc('Standard emoji to replace (e.g., 📝)')
			.addText((text) =>
				text
					.setPlaceholder('📝')
					.onChange((value) => {
						newStandardEmoji = value;
					})
			);

		new Setting(addContainer)
			.setName('Custom Emoji ID')
			.setDesc('ID of the custom emoji from Telegram')
			.addText((text) =>
				text
					.setPlaceholder('5789574674987654321')
					.onChange((value) => {
						newCustomId = value;
					})
			);

		new Setting(addContainer)
			.setName('Description (optional)')
			.setDesc('Description for convenience')
			.addText((text) =>
				text
					.setPlaceholder('Beautiful note')
					.onChange((value) => {
						newDescription = value;
					})
			);

		new Setting(addContainer)
			.setName('Add Mapping')
			.addButton((button) =>
				button
					.setButtonText('Add')
					.setCta()
					.onClick(async () => {
						if (newStandardEmoji && newCustomId) {
							// Add mapping to settings
							if (!plugin.settings.telegram.customEmojis) {
								plugin.settings.telegram.customEmojis = [];
							}
							
							// Check if mapping already exists
							const existingIndex = plugin.settings.telegram.customEmojis.findIndex(
								(m: any) => m.standard === newStandardEmoji
							);
							
							if (existingIndex !== -1) {
								// Update existing
								plugin.settings.telegram.customEmojis[existingIndex] = {
									standard: newStandardEmoji,
									customId: newCustomId,
									description: newDescription || undefined
								};
							} else {
								// Add new
								plugin.settings.telegram.customEmojis.push({
									standard: newStandardEmoji,
									customId: newCustomId,
									description: newDescription || undefined
								});
							}
							
							await plugin.saveSettings();
							plugin.settingsTab.display();
						} else {
							// TODO: Show error
						}
					})
			);
	}

} 