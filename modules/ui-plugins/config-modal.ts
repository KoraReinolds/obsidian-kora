/**
 * Universal Configuration Modal for editing any configuration objects
 */

import { App, Modal, Setting } from 'obsidian';
import { SuggesterFactory } from '../obsidian/suggester-modal';

export interface FieldConfig {
	key: string;
	label: string;
	type: 'text' | 'number' | 'toggle' | 'command' | 'keyvalue' | 'textarea';
	placeholder?: string;
	description?: string;
	required?: boolean;
	multiline?: boolean;
}

export interface ConfigModalOptions<T = any> {
	title: string;
	fields: FieldConfig[];
	initialValues: T;
	onSave: (values: T) => void;
	onCancel?: () => void;
	app: App;
}

export class ConfigModal<T = any> extends Modal {
	private options: ConfigModalOptions<T>;
	private values: T;
	private keyValueFields: Map<string, HTMLElement> = new Map();

	constructor(options: ConfigModalOptions<T>) {
		super(options.app);
		this.options = options;
		this.values = JSON.parse(JSON.stringify(options.initialValues)); // Deep copy
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.options.title });

		this.options.fields.forEach(field => {
			this.createFieldSetting(field);
		});

		// Buttons
		const buttonContainer = contentEl.createDiv('modal-button-container');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '8px';
		buttonContainer.style.marginTop = '20px';

		const cancelBtn = buttonContainer.createEl('button', { text: 'Отмена' });
		cancelBtn.onclick = () => {
			this.close();
			if (this.options.onCancel) {
				this.options.onCancel();
			}
		};

		const saveBtn = buttonContainer.createEl('button', {
			text: 'Сохранить',
			cls: 'mod-cta',
		});
		saveBtn.onclick = () => {
			this.options.onSave(this.values);
			this.close();
		};
	}

	private createFieldSetting(field: FieldConfig) {
		const setting = new Setting(this.contentEl);

		if (field.description) {
			setting.setName(field.label).setDesc(field.description);
		} else {
			setting.setName(field.label);
		}

		switch (field.type) {
			case 'text':
				setting.addText(text => {
					text.setPlaceholder(field.placeholder || '');
					text.setValue(String(this.getValue(field.key) || ''));
					text.onChange(value => {
						this.setValue(field.key, value);
					});
				});
				break;

			case 'textarea': {
				const textareaContainer = this.contentEl.createDiv();
				textareaContainer.style.marginTop = '10px';
				textareaContainer.style.marginBottom = '20px';

				const textarea = textareaContainer.createEl('textarea');
				textarea.style.width = '100%';
				textarea.style.minHeight = '100px';
				textarea.style.resize = 'vertical';
				textarea.placeholder = field.placeholder || '';
				textarea.value = String(this.getValue(field.key) || '');

				textarea.addEventListener('input', () => {
					this.setValue(field.key, textarea.value);
				});
				break;
			}

			case 'number': {
				setting.addText(text => {
					text.setPlaceholder(field.placeholder || '0');
					text.setValue(String(this.getValue(field.key) || 0));
					text.onChange(value => {
						const numValue = parseInt(value) || 0;
						this.setValue(field.key, numValue);
					});
					text.inputEl.type = 'number';
				});
				break;
			}

			case 'toggle': {
				setting.addToggle(toggle => {
					toggle.setValue(Boolean(this.getValue(field.key)));
					toggle.onChange(value => {
						this.setValue(field.key, value);
					});
				});
				break;
			}

			case 'command': {
				const currentCommandId = this.getValue(field.key) as string;
				const commandName = currentCommandId
					? this.getCommandName(currentCommandId)
					: 'Команда не выбрана';

				setting.setDesc(commandName);
				setting.addButton(btn => {
					btn.setButtonText('Выбрать команду');
					btn.onClick(async () => {
						const commandSuggester = SuggesterFactory.createCommandSuggester(
							this.options.app
						);
						const selectedCommand = await commandSuggester.open();
						if (selectedCommand) {
							this.setValue(field.key, selectedCommand.id);
							// Update description
							setting.setDesc(selectedCommand.name);
						}
					});
				});
				break;
			}

			case 'keyvalue': {
				this.createKeyValueField(field, setting);
				break;
			}
		}
	}

	private createKeyValueField(field: FieldConfig, setting: Setting) {
		const container = this.contentEl.createDiv('keyvalue-container');
		container.style.marginTop = '10px';
		container.style.marginBottom = '20px';

		this.keyValueFields.set(field.key, container);

		const currentValues =
			(this.getValue(field.key) as Record<string, string>) || {};

		// Add button for new key-value pair
		setting.addButton(btn => {
			btn.setButtonText('+ Добавить');
			btn.onClick(() => {
				this.addKeyValuePair(field.key, '', '');
			});
		});

		// Render existing key-value pairs
		Object.entries(currentValues).forEach(([key, value]) => {
			this.addKeyValuePair(field.key, key, value as string);
		});
	}

	private addKeyValuePair(fieldKey: string, key: string, value: string) {
		const container = this.keyValueFields.get(fieldKey);
		if (!container) return;

		const pairDiv = container.createDiv('keyvalue-pair');
		pairDiv.style.display = 'flex';
		pairDiv.style.alignItems = 'center';
		pairDiv.style.gap = '8px';
		pairDiv.style.marginBottom = '8px';

		const keyInput = pairDiv.createEl('input', { type: 'text' });
		keyInput.placeholder = 'Ключ';
		keyInput.value = key;
		keyInput.style.flex = '1';

		const separator = pairDiv.createEl('span', { text: ':' });
		separator.style.fontWeight = 'bold';

		const valueInput = pairDiv.createEl('input', { type: 'text' });
		valueInput.placeholder = 'Значение';
		valueInput.value = value;
		valueInput.style.flex = '2';

		const removeBtn = pairDiv.createEl('button', { text: '×' });
		removeBtn.style.background = 'var(--background-modifier-error)';
		removeBtn.style.color = 'var(--text-on-accent)';
		removeBtn.style.border = 'none';
		removeBtn.style.borderRadius = '4px';
		removeBtn.style.padding = '4px 8px';
		removeBtn.style.cursor = 'pointer';

		const updateValues = () => {
			const currentValues =
				(this.getValue(fieldKey) as Record<string, string>) || {};

			// Remove old key if it changed
			if (key && key !== keyInput.value) {
				delete currentValues[key];
			}

			// Add/update new key-value
			if (keyInput.value.trim()) {
				currentValues[keyInput.value.trim()] = valueInput.value;
			}

			this.setValue(fieldKey, currentValues);
			key = keyInput.value.trim(); // Update reference
		};

		keyInput.addEventListener('input', updateValues);
		valueInput.addEventListener('input', updateValues);

		removeBtn.onclick = () => {
			const currentValues =
				(this.getValue(fieldKey) as Record<string, string>) || {};
			if (key) {
				delete currentValues[key];
				this.setValue(fieldKey, currentValues);
			}
			pairDiv.remove();
		};
	}

	private getValue(key: string): any {
		return (this.values as any)[key];
	}

	private setValue(key: string, value: any): void {
		(this.values as any)[key] = value;
	}

	private getCommandName(commandId: string): string {
		// @ts-ignore - Obsidian API has commands property
		const command = this.app.commands.commands[commandId];
		return command ? command.name : 'Неизвестная команда';
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
