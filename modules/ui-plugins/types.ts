/**
 * Types and interfaces for UI plugins system
 */

import { TFile, App } from 'obsidian';

export interface UIButton {
	id: string;
	label: string;
	commandId?: string;
	order?: number;
	commandArguments?: Record<string, string>;
}

export interface UIPlugin {
	id: string;
	name: string;
	enabled: boolean;
	folderPatterns: string[];
	buttons: UIButton[];
}

export interface UIPluginContext {
	file: TFile;
	app: App;
	folderPath: string;
}

export interface UIPluginSettings {
	plugins: UIPlugin[];
}

export interface UICommand {
	id: string;
	name: string;
	callback: (context: UIPluginContext) => Promise<void>;
}

export const DEFAULT_UI_PLUGIN_SETTINGS: UIPluginSettings = {
	plugins: [],
};
