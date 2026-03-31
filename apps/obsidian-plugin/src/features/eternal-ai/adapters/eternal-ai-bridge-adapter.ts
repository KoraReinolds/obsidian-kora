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
		listTurns: conversationId => bridge.listTurns(conversationId),
		listArtifacts: (conversationId, filters) =>
			bridge.listArtifacts(conversationId, filters),
		createSeedArtifact: request => bridge.createSeedArtifact(request),
		updateArtifact: request => bridge.updateArtifact(request),
		deleteArtifact: (conversationId, artifactId) =>
			bridge.deleteArtifact(conversationId, artifactId),
		deleteTurn: (conversationId, turnId) =>
			bridge.deleteTurn(conversationId, turnId),
		sendMessage: request => bridge.sendMessage(request),
		deleteConversation: conversationId =>
			bridge.deleteConversation(conversationId),
		listCreativeEffects: () => bridge.listCreativeEffects(),
		startCreativeEffect: request => bridge.startCreativeEffect(request),
		startCustomGeneration: request => bridge.startCustomGeneration(request),
		pollCreativeEffect: requestId => bridge.pollCreativeEffect(requestId),
		safetyCheckS4: request => bridge.safetyCheckS4(request),
	};
}
