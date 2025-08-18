// Экспорт всех эндпоинтов
export { FilesEndpoint } from './files';
export { FrontmatterUpdateEndpoint } from './frontmatter';
export { AreasEndpoint } from './areas';
export { AreaFrontmattersEndpoint } from './area-frontmatters';
export { GetFrontmatterEndpoint } from './get-frontmatter';
export { FileContentEndpoint } from './file-content';
export { AutomateDocsEndpoint } from './automate-docs';

// Экспорт базового класса
export { BaseEndpoint } from './base';
export type { McpEndpointDefinition } from './base';

// Создание всех экземпляров эндпоинтов
import { FilesEndpoint } from './files';
import { FrontmatterUpdateEndpoint } from './frontmatter';
import { AreasEndpoint } from './areas';
import { AreaFrontmattersEndpoint } from './area-frontmatters';
import { GetFrontmatterEndpoint } from './get-frontmatter';
import { FileContentEndpoint } from './file-content';
import { AutomateDocsEndpoint } from './automate-docs';

export const ALL_ENDPOINTS = [
	new FilesEndpoint(),
	new FrontmatterUpdateEndpoint(),
	new AreasEndpoint(),
	new AreaFrontmattersEndpoint(),
	new GetFrontmatterEndpoint(),
	new FileContentEndpoint(),
	new AutomateDocsEndpoint(),
] as const;
