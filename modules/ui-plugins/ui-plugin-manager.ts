/**
 * UI Plugin Manager - manages flexible UI plugins for note customization
 */

import { TFile, App } from 'obsidian';
import type { UIPlugin, UIButton, UIPluginContext, UIPluginSettings } from './types';

export class UIPluginManager {
  private app: App;
  private settings: UIPluginSettings;

  constructor(app: App, settings: UIPluginSettings) {
    this.app = app;
    this.settings = settings;
  }



  /**
   * Get plugins that should render for the given file
   */
  getPluginsForFile(file: TFile): UIPlugin[] {
    if (!this.settings.plugins) return [];

    return this.settings.plugins.filter(plugin => {
      if (!plugin.enabled) return false;
      
      return plugin.folderPatterns.some(pattern => {
        // Simple pattern matching - can be enhanced with glob patterns later
        const filePath = file.path;
        
        // Exact folder match
        if (filePath.startsWith(pattern + '/') || filePath.startsWith(pattern + '\\')) {
          return true;
        }
        
        // Pattern with wildcards
        if (pattern.includes('*')) {
          const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
          return new RegExp(regexPattern).test(filePath);
        }
        
        return false;
      });
    });
  }

  /**
   * Get all buttons for a file from matching plugins
   */
  getButtonsForFile(file: TFile): UIButton[] {
    const matchingPlugins = this.getPluginsForFile(file);
    
    const allButtons = matchingPlugins.flatMap(plugin => plugin.buttons);
    
    // Sort by order (lower numbers first)
    return allButtons.sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  /**
   * Execute a command for a button
   * buttonClick
   */
  async executeButtonCommand(buttonId: string, file: TFile): Promise<void> {
    // Find the button across all plugins
    const button = this.findButtonById(buttonId);
    if (!button) {
      console.warn(`Button with id ${buttonId} not found`);
      return;
    }

    if (!button.commandId) {
      console.warn(`No command configured for button ${buttonId}`);
      return;
    }

    // Execute Obsidian command directly
    try {
      (this.app as any).commands.executeCommandById(button.commandId);
    } catch (error) {
      console.error(`Error executing command ${button.commandId}:`, error);
    }
  }

  /**
   * Find button by ID across all plugins
   */
  private findButtonById(buttonId: string): UIButton | undefined {
    for (const plugin of this.settings.plugins) {
      const button = plugin.buttons.find(b => b.id === buttonId);
      if (button) return button;
    }
    return undefined;
  }

  /**
   * Create a new UI plugin
   */
  createPlugin(): UIPlugin {
    return {
      id: `plugin-${Date.now()}`,
      name: 'Новый UI плагин',
      enabled: true,
      folderPatterns: [],
      buttons: []
    };
  }

  /**
   * Create a new UI button
   */
  createButton(): UIButton {
    return {
      id: `button-${Date.now()}`,
      label: 'Кнопка',
      commandId: undefined,
      order: 0
    };
  }

  /**
   * Add plugin to settings
   */
  addPlugin(plugin: UIPlugin) {
    if (!this.settings.plugins) {
      this.settings.plugins = [];
    }
    this.settings.plugins.push(plugin);
  }

  /**
   * Remove plugin from settings
   */
  removePlugin(pluginId: string) {
    if (!this.settings.plugins) return;
    
    this.settings.plugins = this.settings.plugins.filter(p => p.id !== pluginId);
  }

  /**
   * Update plugin in settings
   */
  updatePlugin(pluginId: string, updatedPlugin: UIPlugin) {
    if (!this.settings.plugins) return;
    
    const index = this.settings.plugins.findIndex(p => p.id === pluginId);
    if (index >= 0) {
      this.settings.plugins[index] = updatedPlugin;
    }
  }
}