/**
 * Note UI System - система условного рендеринга UI для заметок
 * Позволяет добавлять разные UI элементы в зависимости от path заметки и frontmatter
 */

import { TFile, WorkspaceLeaf, App } from 'obsidian';
import { VectorBridge } from '../vector';
import type { KoraMcpPluginSettings } from '../../main';

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
  
  constructor() {
    this.registerBuiltInRenderers();
  }

  /**
   * Регистрация встроенных рендереров
   */
  private registerBuiltInRenderers() {
    // Telegram Channel Notes Renderer
    this.registerRenderer(new TelegramChannelRenderer());
    
    // Vector Stats Renderer для заметок с vector: true
    this.registerRenderer(new VectorStatsRenderer());

    // Note: chunk preview moved to native sidebar view (ChunkView)
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

/**
 * Рендерер для заметок Telegram каналов
 */
class TelegramChannelRenderer implements NoteUIRenderer {
  id = 'telegram-channel';
  name = 'Telegram Channel UI';

  shouldRender(context: NoteUIContext): boolean {
    const { file, frontmatter } = context;
    
    // Проверяем, что заметка в папке каналов и имеет нужные поля
    return (
      file.path.includes('Channels/') || 
      file.path.includes('channels/') ||
      frontmatter?.type === 'telegram_channel' ||
      frontmatter?.channel_id
    ) && (
      frontmatter?.channel_id || 
      frontmatter?.channel_username ||
      frontmatter?.peer
    );
  }

  async render(containerEl: HTMLElement, context: NoteUIContext): Promise<void> {
    const { frontmatter, vectorBridge } = context;
    
    // Получение данных канала из frontmatter
    const channelId = frontmatter.channel_id || frontmatter.peer;
    const channelTitle = frontmatter.channel_title || frontmatter.title;
    const channelUsername = frontmatter.channel_username || frontmatter.username;
    
    // Заголовок секции
    const headerEl = containerEl.createEl('div', { cls: 'telegram-channel-header' });
    headerEl.style.cssText = `
      background: linear-gradient(135deg, #0088cc, #229ed9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      margin: 10px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    
    headerEl.createEl('span', { 
      text: '📱',
      cls: 'telegram-icon'
    });
    
    const titleEl = headerEl.createEl('div');
    titleEl.createEl('div', { 
      text: channelTitle || 'Telegram Channel',
      cls: 'channel-title'
    }).style.fontWeight = 'bold';
    
    if (channelUsername) {
      titleEl.createEl('div', { 
        text: `@${channelUsername}`,
        cls: 'channel-username'
      }).style.fontSize = '12px';
    }

    // Контейнер для кнопок
    const buttonsEl = containerEl.createEl('div', { cls: 'telegram-channel-buttons' });
    buttonsEl.style.cssText = `
      display: flex;
      gap: 10px;
      margin: 10px 0;
      flex-wrap: wrap;
    `;

    // Кнопка получения сообщений
    this.createButton(buttonsEl, '📥 Получить сообщения', async () => {
      await this.fetchMessages(context, channelId);
    });

    // Кнопка векторизации
    this.createButton(buttonsEl, '🔍 Векторизовать', async () => {
      await this.vectorizeMessages(context, channelId);
    });

    // Кнопка поиска в векторах
    this.createButton(buttonsEl, '🎯 Поиск', async () => {
      await this.searchVectors(context);
    });

    // Кнопка статистики
    this.createButton(buttonsEl, '📊 Статистика', async () => {
      await this.showStats(context, channelId);
    });

    // Информационная панель
    const infoEl = containerEl.createEl('div', { cls: 'telegram-channel-info' });
    infoEl.style.cssText = `
      background: var(--background-secondary);
      border-radius: 5px;
      padding: 10px;
      margin: 10px 0;
      font-size: 12px;
      color: var(--text-muted);
    `;
    
    infoEl.innerHTML = `
      <strong>ID канала:</strong> ${channelId}<br>
      <strong>Последнее обновление:</strong> ${frontmatter.last_update || 'неизвестно'}
    `;
  }

  private createButton(container: HTMLElement, text: string, onClick: () => Promise<void>) {
    const button = container.createEl('button', { text, cls: 'mod-cta' });
    button.style.cssText = `
      padding: 8px 12px;
      border-radius: 5px;
      border: none;
      cursor: pointer;
      font-size: 12px;
    `;
    
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = 'Загрузка...';
      try {
        await onClick();
      } finally {
        button.disabled = false;
        button.textContent = text;
      }
    };
  }

  private async fetchMessages(context: NoteUIContext, channelId: string) {
    // Реализация получения сообщений
    console.log('Fetching messages for channel:', channelId);
    // Здесь будет логика получения сообщений через GramJS API
  }

  private async vectorizeMessages(context: NoteUIContext, channelId: string) {
    const { vectorBridge, frontmatter } = context;
    
    try {
      const request = {
        peer: channelId,
        startDate: frontmatter.vector_start_date,
        endDate: frontmatter.vector_end_date,
        limit: frontmatter.vector_limit || 1000
      };

      const result = await vectorBridge.vectorizeMessages(request);
      console.log('Vectorization result:', result);
    } catch (error) {
      console.error('Vectorization error:', error);
    }
  }

  private async searchVectors(context: NoteUIContext) {
    // Открытие простого поиска или модального окна
    const query = prompt('Введите поисковый запрос:');
    if (!query) return;

    const { vectorBridge } = context;
    try {
      const results = await vectorBridge.searchContent({
        query,
        limit: 10,
        contentTypes: ['telegram_post']
      });
      console.log('Search results:', results);
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  private async showStats(context: NoteUIContext, channelId: string) {
    const { vectorBridge } = context;
    try {
      const stats = await vectorBridge.getStats();
      alert(`Статистика векторной БД:\nВсего документов: ${stats.totalPoints}\nТип контента: ${JSON.stringify(stats.contentTypeBreakdown)}`);
    } catch (error) {
      console.error('Stats error:', error);
    }
  }
}

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