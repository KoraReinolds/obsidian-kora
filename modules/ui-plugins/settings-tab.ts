/**
 * Minimalistic Settings tab for UI Plugins
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type KoraPlugin from '../../main';
import type { UIPlugin, UIButton } from './types';
import { FolderSuggest, SuggesterFactory } from '../obsidian/suggester-modal';
import { ConfigModal, type FieldConfig } from './config-modal';

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
   
    // Get command name dynamically by ID
    const commandName = button.commandId 
      ? this.getCommandName(button.commandId)
      : 'Команда не выбрана';
    
    // Build description with command and arguments
    let description = commandName;
    if (button.commandArguments && Object.keys(button.commandArguments).length > 0) {
      const argsList = Object.entries(button.commandArguments)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      description += ` | Аргументы: ${argsList}`;
    }
    
    setting
      .setName(button.label || 'Без названия')
      .setDesc(description)
      .addExtraButton(btn => {
        btn.setIcon('pencil');
        btn.setTooltip('Редактировать кнопку');
        btn.onClick(() => this.editButton(plugin, button, buttonIndex));
      })
      .addExtraButton(btn => {
        btn.setIcon('trash');
        btn.setTooltip('Удалить кнопку');
        btn.onClick(() => {
          plugin.buttons.splice(buttonIndex, 1);
          this.saveSettings();
          this.display();
        });
      });

    // Style for compact display
    setting.settingEl.style.marginLeft = '20px';
    setting.settingEl.style.borderLeft = '2px solid var(--background-modifier-border)';
    setting.settingEl.style.paddingLeft = '10px';
  }

  private getCommandName(commandId: string): string {
    // todo: вынести получение комманд в модуль /obsidian + доп методы для работы с командами
    // @ts-ignore - Obsidian API has commands property
    const command = this.app.commands.commands[commandId];
    return command ? command.name : 'Неизвестная команда';
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

  private editButton(plugin: UIPlugin, button: UIButton, buttonIndex: number): void {
    const fields: FieldConfig[] = [
      {
        key: 'label',
        label: 'Название кнопки',
        type: 'text',
        placeholder: 'Введите название кнопки',
        required: true
      },
      {
        key: 'commandId',
        label: 'Команда',
        type: 'command',
        description: 'Команда Obsidian для выполнения'
      },
      {
        key: 'order',
        label: 'Порядок',
        type: 'number',
        placeholder: '0',
        description: 'Порядок отображения кнопки'
      },
      {
        key: 'commandArguments',
        label: 'Аргументы команды',
        type: 'keyvalue',
        description: 'Аргументы для передачи в команду в формате ключ: значение'
      }
    ];

    const modal = new ConfigModal({
      title: 'Редактировать кнопку',
      fields,
      initialValues: {
        label: button.label || '',
        commandId: button.commandId || '',
        order: button.order || 0,
        commandArguments: button.commandArguments || {}
      },
      onSave: (values) => {
        button.label = values.label;
        button.commandId = values.commandId;
        button.order = values.order;
        button.commandArguments = values.commandArguments;
        this.saveSettings();
        this.display();
      },
      app: this.app
    });

    modal.open();
  }

  private saveSettings(): void {
    this.plugin.saveSettings();
  }
}