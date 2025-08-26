export const MCP_CONFIG = {
	DEFAULT_PORT: 8123,
	BASE_URL: '127.0.0.1',
} as const;

export const getMcpUrl = (port: number = MCP_CONFIG.DEFAULT_PORT) => 
	`http://${MCP_CONFIG.BASE_URL}:${port}`;

export const MCP_ENDPOINTS = {
	FILES: '/files',
	FRONTMATTER: '/frontmatter',
	GET_FRONTMATTER: '/get_frontmatter',
	FILE_CONTENT: '/file_content',
	AUTOMATE_DOCS: '/automate_docs',
} as const;
