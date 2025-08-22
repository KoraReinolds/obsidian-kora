/**
 * Telegram utility functions shared across modules
 */

import { TFile } from 'obsidian';

/**
 * Create navigation buttons for Telegram messages
 */
export function createNavigationButtons(file: TFile): any[][] {
  const buttons = [
    [
        { text: '📝', data: 'view_note:' + file.name },
        { text: '✏️', data: 'edit_note:' + file.name },
        { text: '🗂️', data: 'browse_folder' },
        { text: '🔍', data: 'search_vault' },
    ],
  ]; 
  return buttons;
}
