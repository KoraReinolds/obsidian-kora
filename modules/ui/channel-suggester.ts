/**
 * Channel Suggester - Modal dialog for selecting channels to send notes to
 */

import { App, FuzzySuggestModal, TFile, Notice } from 'obsidian';
import { ChannelConfigService, ChannelConfig } from '../telegram/channel-config-service';
import type { KoraMcpPluginSettings } from '../../main';

/**
 * Modal for suggesting and selecting channels for the current note
 */
export class ChannelSuggester extends FuzzySuggestModal<ChannelConfig> {
  private file: TFile;
  private channelConfigService: ChannelConfigService;
  private availableChannels: ChannelConfig[];
  private onSelectCallback: (channel: ChannelConfig) => void;

  constructor(
    app: App, 
    file: TFile, 
    settings: KoraMcpPluginSettings,
    onSelect: (channel: ChannelConfig) => void
  ) {
    super(app);
    this.file = file;
    this.channelConfigService = new ChannelConfigService(app, settings);
    this.onSelectCallback = onSelect;
    this.availableChannels = [];

    // Set modal title
    this.setPlaceholder('Выберите канал для отправки заметки...');
  }

  /**
   * Open the suggester and check if channels are available
   */
  public openSuggester(): void {
    // Check if file is in a configured folder
    const folderConfig = this.channelConfigService.getFolderConfigForFile(this.file);
    if (!folderConfig) {
      new Notice('Файл не находится в папке с настроенным конфигом каналов');
      return;
    }

    // Get available channels for this file
    this.availableChannels = this.channelConfigService.getChannelConfigsForFile(this.file);
    
    if (this.availableChannels.length === 0) {
      new Notice('Нет доступных каналов для этой папки');
      return;
    }

    // Open the modal
    this.open();
  }

  /**
   * Get all available channel items for the fuzzy search
   */
  getItems(): ChannelConfig[] {
    return this.availableChannels;
  }

  /**
   * Get the text to display for each item in the suggester
   */
  getItemText(channel: ChannelConfig): string {
    return channel.name;
  }

  /**
   * Render additional information for each suggestion
   */
  renderSuggestion(value: any, el: HTMLElement): void {
    const channel = value.item as ChannelConfig;
    
    // Create main container
    const container = el.createDiv({ cls: 'channel-suggestion' });
    
    // Channel name
    const nameEl = container.createDiv({ cls: 'channel-name' });
    nameEl.setText(channel.name);
    
    // Channel info
    const infoEl = container.createDiv({ cls: 'channel-info' });
    
    // Channel ID (shortened for display)
    const channelIdShort = channel.channelId.length > 20 
      ? `${channel.channelId.slice(0, 10)}...${channel.channelId.slice(-7)}`
      : channel.channelId;
    infoEl.createSpan({ cls: 'channel-id', text: `ID: ${channelIdShort}` });
    
    // Message status
    if (channel.messageId) {
      infoEl.createSpan({ cls: 'message-status published', text: ' • Опубликовано' });
    } else {
      infoEl.createSpan({ cls: 'message-status new', text: ' • Новое сообщение' });
    }

    // Add some basic styling
    container.style.padding = '8px 0';
    nameEl.style.fontWeight = 'bold';
    nameEl.style.marginBottom = '4px';
    infoEl.style.fontSize = '0.85em';
    infoEl.style.color = 'var(--text-muted)';
    
    const publishedEl = infoEl.querySelector('.published') as HTMLElement;
    if (publishedEl) {
      publishedEl.style.color = 'var(--text-success)';
    }
    
    const newEl = infoEl.querySelector('.new') as HTMLElement;
    if (newEl) {
      newEl.style.color = 'var(--text-accent)';
    }
  }

  /**
   * Handle when a channel is selected
   */
  onChooseItem(channel: ChannelConfig): void {
    this.onSelectCallback(channel);
  }
}
