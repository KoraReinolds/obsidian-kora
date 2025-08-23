/**
 * UI Plugin Renderer - renders buttons from UI plugins as part of note UI system
 */

import { TFile, WorkspaceLeaf, App } from 'obsidian';
import type { NoteUIRenderer, NoteUIContext } from '../ui/note-ui-system';
import { UIPluginManager } from './ui-plugin-manager';
import type { UIButton } from './types';

export class UIPluginRenderer implements NoteUIRenderer {
  id = 'ui-plugins';
  name = 'UI Plugins';

  private pluginManager: UIPluginManager;

  constructor(pluginManager: UIPluginManager) {
    this.pluginManager = pluginManager;
  }

  shouldRender(context: NoteUIContext): boolean {
    const buttons = this.pluginManager.getButtonsForFile(context.file);
    return buttons.length > 0;
  }

  async render(containerEl: HTMLElement, context: NoteUIContext): Promise<void> {
    const { file } = context;
    const buttons = this.pluginManager.getButtonsForFile(file);

    if (buttons.length === 0) return;

    // Create container for plugin buttons
    const buttonsContainer = containerEl.createEl('div', { cls: 'ui-plugins-container' });
    buttonsContainer.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0;
      padding: 10px;
      background: var(--background-secondary);
      border-radius: 6px;
      border-left: 3px solid var(--accent-color);
    `;

    // Render each button
    for (const button of buttons) {
      this.renderButton(buttonsContainer, button, file);
    }
  }

  private renderButton(container: HTMLElement, button: UIButton, file: TFile): void {
    const buttonEl = container.createEl('button', { 
      text: button.label,
      cls: 'ui-plugin-button mod-cta'
    });

    buttonEl.style.cssText = `
      padding: 4px 8px;
      margin-right: 8px;
      font-size: 12px;
    `;

    buttonEl.onclick = async () => {
      buttonEl.disabled = true;
      const originalText = buttonEl.textContent;
      buttonEl.textContent = '...';
      
      try {
        await this.pluginManager.executeButtonCommand(button.id, file);
      } catch (error) {
        console.error(`Error executing button ${button.id}:`, error);
      } finally {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
      }
    };
  }

  cleanup?(containerEl: HTMLElement): void {
    // Clean up any event listeners if needed
    const buttons = containerEl.querySelectorAll('.ui-plugin-button');
    buttons.forEach(button => {
      (button as HTMLElement).onclick = null;
    });
  }
}