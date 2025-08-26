// Global type declarations for gramjs-server

declare module 'node-telegram-bot-api' {
	interface TelegramBot {
		getMe(): Promise<any>;
		sendMessage(
			chatId: string | number,
			text: string,
			options?: any
		): Promise<any>;
		sendDocument(
			chatId: string | number,
			doc: any,
			options?: any
		): Promise<any>;
	}

	interface TelegramBotConstructor {
		new (token: string, options?: any): TelegramBot;
	}

	const TelegramBot: TelegramBotConstructor;
	export = TelegramBot;
}

// Extend global types for better compatibility
declare global {
	namespace Express {
		interface Request {
			query: any;
			body: any;
			params: any;
		}
	}
}

export {};
