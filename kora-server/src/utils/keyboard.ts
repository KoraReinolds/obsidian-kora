/**
 * Keyboard utils: Convert button matrix to GramJS Inline Keyboard.
 */

import { Api } from 'telegram';

/**
 * JSDoc: Creates ReplyInlineMarkup from a matrix of button descriptors.
 */
export function createInlineKeyboard(
	buttons?: Array<Array<{ text: string; url?: string; data?: string }>>
): any {
	if (!buttons || buttons.length === 0) return null;

	const rows = buttons.map(row => {
		const buttonRow = row.map(btn => {
			if (btn.url) {
				return new Api.KeyboardButtonUrl({ text: btn.text, url: btn.url });
			}
			if (btn.data) {
				return new Api.KeyboardButtonCallback({
					text: btn.text,
					data: Buffer.from(btn.data, 'utf-8'),
				});
			}
			return new Api.KeyboardButtonCallback({
				text: btn.text,
				data: Buffer.from(btn.text, 'utf-8'),
			});
		});
		return new Api.KeyboardButtonRow({ buttons: buttonRow });
	});

	return new Api.ReplyInlineMarkup({ rows });
}
