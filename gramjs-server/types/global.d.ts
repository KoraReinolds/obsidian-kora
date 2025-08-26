// Global type definitions for gramjs-server

declare module 'input' {
	function question(query: string): Promise<string>;
	export = question;
}

declare module 'dotenv/config';

// Express types
declare global {
	interface RequestBody {
		[key: string]: any;
	}
}

// Telegram types
export interface TelegramEntity {
	_: string;
	offset: number;
	length: number;
	[key: string]: any;
}

export interface TelegramMessage {
	id: any;
	date: string | null;
	message: any;
	out?: any;
	mentioned?: any;
	mediaUnread?: any;
	silent?: any;
	post?: any;
	fromScheduled?: any;
	legacy?: any;
	editHide?: any;
	pinned?: any;
	noforwards?: any;
	views?: any;
	forwards?: any;
	replies?: any;
	editDate?: any;
	postAuthor?: any;
	groupedId?: any;
	restrictionReason?: any;
	peerId?: any;
	fromId?: { userId?: any } | null;
	fwdFrom?: any;
	viaBotId?: any;
	replyTo?: any;
	media?: any;
	replyMarkup?: any;
	entities?: TelegramEntity[];
	ttlPeriod?: any;
	formattingEntities?: TelegramEntity[];
}
