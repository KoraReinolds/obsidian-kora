import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../main';
import type { UIPlugin, UIButton } from '../../../../modules/ui-plugins/types';
import { FolderSuggest } from '../../../../modules/obsidian/suggester-modal';
import {
	ConfigModal,
	type FieldConfig,
} from '../../../../modules/ui-plugins/config-modal';

export class UIPluginSettingsTab extends PluginSettingTab {
	private plugin: KoraPlugin;

	constructor(app: App, plugin: KoraPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// @ts-ignore
		this.id = 'kora-ui-plugins-settings';
		// @ts-ignore
		this.name = '- Kora: UI Plugins';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'UI РџР»Р°РіРёРЅС‹' });
		containerEl.createEl('p', {
			text: 'РќР°СЃС‚СЂРѕР№С‚Рµ РєРЅРѕРїРєРё РґР»СЏ Р·Р°РјРµС‚РѕРє РІ РѕРїСЂРµРґРµР»РµРЅРЅС‹С… РїР°РїРєР°С…. РљРЅРѕРїРєРё Р±СѓРґСѓС‚ РІС‹РїРѕР»РЅСЏС‚СЊ РєРѕРјР°РЅРґС‹ Obsidian.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Р”РѕР±Р°РІРёС‚СЊ UI РїР»Р°РіРёРЅ')
			.setDesc(
				'РЎРѕР·РґР°С‚СЊ РЅРѕРІС‹Р№ РЅР°Р±РѕСЂ РєРЅРѕРїРѕРє РґР»СЏ РїР°РїРѕРє'
			)
			.addButton(cb =>
				cb.setButtonText('+ РџР»Р°РіРёРЅ').onClick(() => this.addPlugin())
			);

		if (!this.plugin.settings.uiPlugins.plugins) {
			this.plugin.settings.uiPlugins.plugins = [];
		}

		this.plugin.settings.uiPlugins.plugins.forEach((plugin, index) => {
			this.displayPlugin(plugin, index);
		});
	}

	private displayPlugin(plugin: UIPlugin, index: number): void {
		const setting = new Setting(this.containerEl);

		setting
			.setName('UI РџР»Р°РіРёРЅ')
			.setDesc('РќР°СЃС‚СЂРѕР№РєРё РїР»Р°РіРёРЅР°')
			.addText(text => {
				text
					.setValue(plugin.name)
					.setPlaceholder('РќР°Р·РІР°РЅРёРµ РїР»Р°РіРёРЅР°')
					.onChange(value => {
						plugin.name = value;
						this.saveSettings();
					});
			})
			.addText(text => {
				text
					.setPlaceholder('РџР°РїРєРё С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ')
					.setValue(plugin.folderPatterns.join(', '))
					.onChange(value => {
						plugin.folderPatterns = value
							.split(',')
							.map(s => s.trim())
							.filter(s => s);
						this.saveSettings();
					});
				new FolderSuggest(text.inputEl, this.app);
			})
			.addToggle(toggle => {
				toggle.setValue(plugin.enabled).onChange(value => {
					plugin.enabled = value;
					this.saveSettings();
				});
			})
			.addButton(cb =>
				cb.setButtonText('+ РљРЅРѕРїРєР°').onClick(() => this.addButton(plugin))
			)
			.addButton(cb =>
				cb
					.setButtonText('РЈРґР°Р»РёС‚СЊ')
					.setWarning()
					.onClick(() => {
						this.plugin.settings.uiPlugins.plugins.splice(index, 1);
						this.saveSettings();
						this.display();
					})
			);

		plugin.buttons.forEach((button, buttonIndex) => {
			this.displayButton(plugin, button, buttonIndex);
		});
	}

	private displayButton(
		plugin: UIPlugin,
		button: UIButton,
		buttonIndex: number
	): void {
		const setting = new Setting(this.containerEl);
		setting.setClass('ui-button-setting');

		const commandName = button.commandId
			? this.getCommandName(button.commandId)
			: 'РљРѕРјР°РЅРґР° РЅРµ РІС‹Р±СЂР°РЅР°';

		let description = commandName;
		if (
			button.commandArguments &&
			Object.keys(button.commandArguments).length > 0
		) {
			const argsList = Object.entries(button.commandArguments)
				.map(([key, value]) => `${key}: ${value}`)
				.join(', ');
			description += ` | РђСЂРіСѓРјРµРЅС‚С‹: ${argsList}`;
		}

		setting
			.setName(button.label || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ')
			.setDesc(description)
			.addExtraButton(btn => {
				btn.setIcon('pencil');
				btn.setTooltip('Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РєРЅРѕРїРєСѓ');
				btn.onClick(() => this.editButton(plugin, button, buttonIndex));
			})
			.addExtraButton(btn => {
				btn.setIcon('trash');
				btn.setTooltip('РЈРґР°Р»РёС‚СЊ РєРЅРѕРїРєСѓ');
				btn.onClick(() => {
					plugin.buttons.splice(buttonIndex, 1);
					this.saveSettings();
					this.display();
				});
			});

		setting.settingEl.style.marginLeft = '20px';
		setting.settingEl.style.borderLeft =
			'2px solid var(--background-modifier-border)';
		setting.settingEl.style.paddingLeft = '10px';
	}

	private getCommandName(commandId: string): string {
		// @ts-ignore
		const command = this.app.commands.commands[commandId];
		return command ? command.name : 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РєРѕРјР°РЅРґР°';
	}

	private addPlugin(): void {
		const newPlugin = (this.plugin as any).uiPluginManager.createPlugin();
		this.plugin.settings.uiPlugins.plugins.push(newPlugin);
		this.saveSettings();
		this.display();
	}

	private addButton(plugin: UIPlugin): void {
		const newButton = (this.plugin as any).uiPluginManager.createButton();
		plugin.buttons.push(newButton);
		this.saveSettings();
		this.display();
	}

	private editButton(
		plugin: UIPlugin,
		button: UIButton,
		buttonIndex: number
	): void {
		const fields: FieldConfig[] = [
			{
				key: 'label',
				label: 'РќР°Р·РІР°РЅРёРµ РєРЅРѕРїРєРё',
				type: 'text',
				placeholder: 'Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ РєРЅРѕРїРєРё',
				required: true,
			},
			{
				key: 'commandId',
				label: 'РљРѕРјР°РЅРґР°',
				type: 'command',
				description: 'РљРѕРјР°РЅРґР° Obsidian РґР»СЏ РІС‹РїРѕР»РЅРµРЅРёСЏ',
			},
			{
				key: 'order',
				label: 'РџРѕСЂСЏРґРѕРє',
				type: 'number',
				placeholder: '0',
				description: 'РџРѕСЂСЏРґРѕРє РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РєРЅРѕРїРєРё',
			},
			{
				key: 'commandArguments',
				label: 'РђСЂРіСѓРјРµРЅС‚С‹ РєРѕРјР°РЅРґС‹',
				type: 'keyvalue',
				description:
					'РђСЂРіСѓРјРµРЅС‚С‹ РґР»СЏ РїРµСЂРµРґР°С‡Рё РІ РєРѕРјР°РЅРґСѓ РІ С„РѕСЂРјР°С‚Рµ РєР»СЋС‡: Р·РЅР°С‡РµРЅРёРµ',
			},
		];

		const modal = new ConfigModal({
			title: 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РєРЅРѕРїРєСѓ',
			fields,
			initialValues: {
				label: button.label || '',
				commandId: button.commandId || '',
				order: button.order || 0,
				commandArguments: button.commandArguments || {},
			},
			onSave: values => {
				button.label = values.label;
				button.commandId = values.commandId;
				button.order = values.order;
				button.commandArguments = values.commandArguments;
				this.saveSettings();
				this.display();
			},
			app: this.app,
		});

		modal.open();
	}

	private saveSettings(): void {
		this.plugin.saveSettings();
	}
}
