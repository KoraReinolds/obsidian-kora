/**
 * Minimalistic Settings tab for UI Plugins
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../../main';
import type { UIPlugin, UIButton } from './types';
import { FolderSuggest, CommandSuggester } from '../obsidian/suggester';

export class UIPluginSettingsTab extends PluginSettingTab {
  private plugin: KoraPlugin;

  constructor(app: App, plugin: KoraPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    // @ts-ignore
    this.id = "kora-ui-plugins-settings";
    // @ts-ignore
    this.name = "- Kora: UI Plugins";
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    containerEl.createEl('h2', { text: 'UI Плагины' });
    containerEl.createEl('p', { 
      text: 'Настройте кнопки для заметок в определенных папках. Кнопки будут выполнять команды Obsidian.',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Добавить UI плагин')
      .setDesc('Создать новый набор кнопок для папок')
      .addButton(cb => cb
        .setButtonText('+ Плагин')
        .onClick(() => this.addPlugin()));

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
      .setName('UI Плагин')
      .setDesc('Настройки плагина')
      .addText(text => {
        text.setValue(plugin.name)
          .setPlaceholder('Название плагина')
          .onChange(value => {
            plugin.name = value;
            this.saveSettings();
          });
      })
      .addText(text => {
        text.setPlaceholder('Папки через запятую')
          .setValue(plugin.folderPatterns.join(', '))
          .onChange(value => {
            plugin.folderPatterns = value.split(',').map(s => s.trim()).filter(s => s);
            this.saveSettings();
          });
        new FolderSuggest(text.inputEl, this.app);
      })
      .addToggle(toggle => {
        toggle.setValue(plugin.enabled)
          .onChange(value => {
            plugin.enabled = value;
            this.saveSettings();
          });
      })
      .addButton(cb => cb
        .setButtonText('+ Кнопка')
        .onClick(() => this.addButton(plugin)))
      .addButton(cb => cb
        .setButtonText('Удалить')
        .setWarning()
        .onClick(() => {
          this.plugin.settings.uiPlugins.plugins.splice(index, 1);
          this.saveSettings();
          this.display();
        }));

    // Display buttons
    plugin.buttons.forEach((button, buttonIndex) => {
      this.displayButton(plugin, button, buttonIndex);
    });
  }

  private displayButton(plugin: UIPlugin, button: UIButton, buttonIndex: number): void {
    const setting = new Setting(this.containerEl);
    setting.setClass('ui-button-setting');
   
    // Get command name for description
    const commandDesc = button.command 
      ? `${button.command.name}` 
      : 'Команда не выбрана';
    
    setting
      .setName('Кнопка')
      .setDesc(commandDesc)
      .addText(text => {
        text.setPlaceholder('Текст кнопки')
          .setValue(button.label)
          .onChange(value => {
            button.label = value;
            this.saveSettings();
            this.display(); // Refresh to update name
          });
      })
      .addText(text => {
        text.setPlaceholder('Порядок')
          .setValue(String(button.order || 0))
          .onChange(value => {
            button.order = parseInt(value) || 0;
            this.saveSettings();
          });
      })
      .addButton(cb => cb
        .setButtonText('Выбрать команду')
        .onClick(() => {
          new CommandSuggester(this.app, (command) => {
            button.command = command;
            this.saveSettings();
            this.display();
          }).open();
        }))
      .addButton(cb => cb
        .setButtonText('Удалить')
        .setWarning()
        .onClick(() => {
          plugin.buttons.splice(buttonIndex, 1);
          this.saveSettings();
          this.display();
        }));

    // Style for compact display
    setting.settingEl.style.marginLeft = '20px';
    setting.settingEl.style.borderLeft = '2px solid var(--background-modifier-border)';
    setting.settingEl.style.paddingLeft = '10px';
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

  private saveSettings(): void {
    this.plugin.saveSettings();
  }
}