/**
 * @module modules/integrations/services/integration-registry-singleton
 * @description Ленивая точка доступа к read-only registry интеграций.
 */

import { IntegrationRegistry } from '../integration-registry.js';

let integrationRegistry: IntegrationRegistry | null = null;

export function getIntegrationRegistry(): IntegrationRegistry {
	if (!integrationRegistry) {
		integrationRegistry = new IntegrationRegistry();
	}
	return integrationRegistry;
}
