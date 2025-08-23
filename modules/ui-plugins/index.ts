/**
 * UI Plugins module - flexible UI system for notes
 */

export { UIPluginManager } from './ui-plugin-manager';
export { UIPluginRenderer } from './ui-plugin-renderer';
export { UIPluginSettingsTab } from './settings-tab';
export type { 
  UIPlugin, 
  UIButton, 
  UIPluginContext, 
  UICommand, 
  UIPluginSettings 
} from './types';
export { DEFAULT_UI_PLUGIN_SETTINGS } from './types';