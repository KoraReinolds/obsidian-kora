/**
 * UI Plugins module - flexible UI system for notes
 */

export { UIPluginManager } from './ui-plugin-manager';
export { UIPluginRenderer } from './ui-plugin-renderer';
export { UIPluginSettingsTab } from './settings-tab';
export { UIManager } from './ui-manager';
export { NoteUISystem } from './note-ui-system';
export type {
	UIPlugin,
	UIButton,
	UIPluginContext,
	UICommand,
	UIPluginSettings,
} from './types';
export type { NoteUIContext, NoteUIRenderer } from './note-ui-system';
export { DEFAULT_UI_PLUGIN_SETTINGS } from './types';
