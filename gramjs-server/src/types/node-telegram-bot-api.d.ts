declare module 'node-telegram-bot-api' {
  interface TelegramBot {
    constructor(token: string, options?: any): TelegramBot;
    getMe(): Promise<any>;
    sendMessage(chatId: string, text: string, options?: any): Promise<any>;
    sendDocument(chatId: string, document: string, options?: any): Promise<any>;
  }
  
  const TelegramBot: {
    new (token: string, options?: any): TelegramBot;
  };
  
  export = TelegramBot;
}