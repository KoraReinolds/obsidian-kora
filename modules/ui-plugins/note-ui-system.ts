/**
 * Note UI System - система условного рендеринга UI для заметок
 * Позволяет добавлять разные UI элементы в зависимости от path заметки и frontmatter
 */

import { TFile, WorkspaceLeaf, App } from 'obsidian';
import { VectorBridge } from '../vector';
import { UIPluginRenderer } from './ui-plugin-renderer';
import type { KoraMcpPluginSettings } from '../../main';
import type { UIPluginManager } from './ui-plugin-manager';

export interface NoteUIContext {
  file: TFile;
  leaf: WorkspaceLeaf;
  app: App;
  frontmatter: any;
  settings: KoraMcpPluginSettings;
  vectorBridge: VectorBridge;
  getFileContent: (file: TFile) => Promise<string>;
}

export interface NoteUIRenderer {
  id: string;
  name: string;
  shouldRender(context: NoteUIContext): boolean;
  render(containerEl: HTMLElement, context: NoteUIContext): Promise<void>;
  cleanup?(containerEl: HTMLElement): void;
}

export class NoteUISystem {
  private renderers: Map<string, NoteUIRenderer> = new Map();
  private activeRenderers: Map<string, Set<string>> = new Map(); // filePath -> renderIds
  private uiPluginManager?: UIPluginManager;
  
  constructor(uiPluginManager?: UIPluginManager) {
    this.uiPluginManager = uiPluginManager;
    this.registerBuiltInRenderers();
  }

  /**
   * Регистрация встроенных рендереров
   */
  private registerBuiltInRenderers() {
    // UI Plugins Renderer - flexible button system
    if (this.uiPluginManager) {
      this.registerRenderer(new UIPluginRenderer(this.uiPluginManager));
    }
  }

  /**
   * Регистрация нового рендерера UI для заметок
   */
  registerRenderer(renderer: NoteUIRenderer) {
    this.renderers.set(renderer.id, renderer);
  }

  /**
   * Удаление рендерера
   */
  unregisterRenderer(rendererId: string) {
    this.renderers.delete(rendererId);
  }

  /**
   * Рендеринг UI для заметки
   */
  async renderNoteUI(containerEl: HTMLElement, context: NoteUIContext) {
    const filePath = context.file.path;
    
    // Очистка предыдущих рендереров для этого файла
    this.cleanupFileRenderers(containerEl, filePath);
    
    // Получение frontmatter
    const cache = context.app.metadataCache.getFileCache(context.file);
    context.frontmatter = cache?.frontmatter || {};
    
    const activeRenderers = new Set<string>();
    
    // Проход по всем зарегистрированным рендерерам
    for (const [rendererId, renderer] of this.renderers) {
      try {
        if (renderer.shouldRender(context)) {
          // Создание контейнера для этого рендерера
      const rendererContainer = containerEl.createDiv({
            cls: `note-ui-renderer note-ui-${rendererId}`
          });
          rendererContainer.setAttribute('data-renderer-id', rendererId);
          
          await renderer.render(rendererContainer, context);
          activeRenderers.add(rendererId);
        }
      } catch (error) {
        console.error(`Error rendering ${rendererId} for ${filePath}:`, error);
      }
    }
    
    this.activeRenderers.set(filePath, activeRenderers);
  }

  /**
   * Очистка рендереров для файла
   */
  private cleanupFileRenderers(containerEl: HTMLElement, filePath: string) {
    const activeRenderers = this.activeRenderers.get(filePath);
    if (!activeRenderers) return;

    for (const rendererId of activeRenderers) {
      const renderer = this.renderers.get(rendererId);
      const rendererContainer = containerEl.querySelector(`[data-renderer-id="${rendererId}"]`);
      
      if (renderer?.cleanup && rendererContainer) {
        try {
          renderer.cleanup(rendererContainer as HTMLElement);
        } catch (error) {
          console.error(`Error cleaning up ${rendererId}:`, error);
        }
      }
      
      rendererContainer?.remove();
    }
    
    this.activeRenderers.delete(filePath);
  }

  /**
   * Полная очистка всех рендереров
   */
  cleanup() {
    this.activeRenderers.clear();
  }
}
