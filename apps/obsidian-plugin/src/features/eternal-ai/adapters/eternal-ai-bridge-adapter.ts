import type { EternalAiTransportPort } from '../ports/eternal-ai-transport-port';
import { EternalAiBridge } from '../transport/eternal-ai-bridge';

/**
 * @description Адаптер, скрывающий конкретную реализацию bridge от Vue feature.
 * @param {EternalAiBridge} bridge - HTTP-клиент Eternal AI модуля.
 * @returns {EternalAiTransportPort} Транспортный порт для экрана.
 */
export function createEternalAiBridgeAdapter(
	bridge: EternalAiBridge
): EternalAiTransportPort {
	return {
		getHealth: () => bridge.getHealth(),
		listConversations: () => bridge.listConversations(),
		listMessages: conversationId => bridge.listMessages(conversationId),
		sendMessage: request => bridge.sendMessage(request),
		deleteConversation: conversationId =>
			bridge.deleteConversation(conversationId),
	};
}
