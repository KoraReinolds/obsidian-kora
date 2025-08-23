/**
 * Note UI System - система условного рендеринга UI для заметок
 * Позволяет добавлять разные UI элементы в зависимости от path заметки и frontmatter
 */

import { TFile, WorkspaceLeaf, App } from 'obsidian';
import { VectorBridge } from '../vector';
import { UIPluginRenderer } from '../ui-plugins';
import type { KoraMcpPluginSettings } from '../../main';
import type { UIPluginManager } from '../ui-plugins';

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

    // Vector Stats Renderer для заметок с vector: true
    this.registerRenderer(new VectorStatsRenderer());

    // Note: chunk preview moved to native sidebar view (ChunkView)
    // Note: TelegramChannelRenderer removed - replaced by flexible UI plugins
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

// Telegram Channel renderer removed - replaced by flexible UI plugins system

/**
 * Рендерер для заметок с поддержкой векторного поиска
 */
class VectorStatsRenderer implements NoteUIRenderer {
  id = 'vector-stats';
  name = 'Vector Stats UI';

  shouldRender(context: NoteUIContext): boolean {
    const { frontmatter } = context;
    return frontmatter?.vector === true || frontmatter?.show_vector_stats === true;
  }

  async render(containerEl: HTMLElement, context: NoteUIContext): Promise<void> {
    const { vectorBridge } = context;
    
    const statsContainer = containerEl.createEl('div', { cls: 'vector-stats-container' });
    statsContainer.style.cssText = `
      background: var(--background-secondary);
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0;
    `;

    const headerEl = statsContainer.createEl('h4', { 
      text: '🔍 Векторная база данных',
      cls: 'vector-stats-header' 
    });
    headerEl.style.margin = '0 0 10px 0';

    const loadingEl = statsContainer.createEl('div', { text: 'Загрузка статистики...' });

    try {
      const stats = await vectorBridge.getStats();
      loadingEl.remove();

      const statsEl = statsContainer.createEl('div', { cls: 'vector-stats-content' });
      statsEl.innerHTML = `
        <div><strong>Коллекция:</strong> ${stats.collection}</div>
        <div><strong>Всего документов:</strong> ${stats.totalPoints}</div>
        <div><strong>Размерность векторов:</strong> ${stats.vectorSize}</div>
        <div><strong>Статус:</strong> ${stats.status}</div>
      `;

      if (stats.contentTypeBreakdown) {
        const breakdownEl = statsContainer.createEl('div', { cls: 'content-breakdown' });
        breakdownEl.innerHTML = '<strong>По типам контента:</strong>';
        
        Object.entries(stats.contentTypeBreakdown).forEach(([type, count]) => {
          breakdownEl.innerHTML += `<div style="margin-left: 15px;">• ${type}: ${count}</div>`;
        });
      }

    } catch (error) {
      loadingEl.textContent = `Ошибка загрузки: ${error.message}`;
    }
  }
}

// Chunk preview renderer removed from in-note UI