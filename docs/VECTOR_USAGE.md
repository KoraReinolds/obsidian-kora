# Vector Search Usage Guide

This document provides examples and usage instructions for the vector search functionality.

## Prerequisites

1. **Qdrant**: Running on `localhost:6333`
   ```bash
   docker run -p 6333:6333 qdrant/qdrant:latest
   ```

2. **OpenAI API Key**: Set in environment or plugin settings
   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

3. **Dependencies**: Install required packages
   ```bash
   npm install
   ```

4. **GramJS Server**: Start with vector services
   ```bash
   npm run gramjs-server
   ```

## Configuration

### Plugin Settings
1. Go to Settings → Kora MCP Plugin
2. Scroll to "Vector Search Settings"
3. Enable vectorization
4. Configure Qdrant URL and OpenAI API key
5. Test connection

### Environment Variables (Alternative)
```bash
export QDRANT_URL="http://localhost:6333"
export QDRANT_COLLECTION="kora_content" 
export OPENAI_API_KEY="sk-..."
```

## API Endpoints

The GramJS server exposes these vector endpoints on `http://localhost:8124`:

### Vectorize Content
```http
POST /vectorize
Content-Type: application/json

{
  "id": "unique_id",
  "contentType": "telegram_post",
  "title": "Optional Title",
  "content": "Text to vectorize",
  "metadata": {
    "telegram": {
      "channelId": "channel_id",
      "messageId": 123
    }
  }
}
```

### Vectorize Telegram Messages
```http
POST /vectorize_messages
Content-Type: application/json

{
  "peer": "@channel_username",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "limit": 100
}
```

### Search Content
```http
POST /search
Content-Type: application/json

{
  "query": "search text",
  "limit": 10,
  "contentTypes": ["telegram_post", "obsidian_note"],
  "filters": {
    "telegram.channelId": "specific_channel"
  },
  "scoreThreshold": 0.7
}
```

### Get Statistics
```http
GET /vector_stats
```

### Health Check
```http
GET /vector_health
```

## Usage Examples

### 1. Vectorize Telegram Channel Posts

```javascript
const vectorBridge = new VectorBridge();

// Vectorize last 100 messages from a channel
const result = await vectorBridge.vectorizeMessages({
  peer: "@my_channel",
  limit: 100
});

console.log(`Processed ${result.processed} messages`);
```

### 2. Vectorize Obsidian Note

```javascript
// Get current file
const activeFile = this.app.workspace.getActiveFile();
const content = await this.app.vault.read(activeFile);

// Vectorize note
const result = await vectorBridge.vectorizeNote({
  path: activeFile.path,
  content: content,
  title: activeFile.name,
  metadata: {
    tags: ["example", "note"],
    folder: "Documents"
  }
});
```

### 3. Search Across All Content

```javascript
const searchResults = await vectorBridge.searchContent({
  query: "artificial intelligence machine learning",
  limit: 5,
  scoreThreshold: 0.5
});

console.log(`Found ${searchResults.total} results:`);
searchResults.results.forEach(result => {
  console.log(`- ${result.content.title} (score: ${result.score})`);
  console.log(`  ${result.snippet}`);
});
```

### 4. Filter by Content Type

```javascript
// Search only Telegram posts
const telegramResults = await vectorBridge.searchContent({
  query: "cryptocurrency bitcoin",
  contentTypes: ["telegram_post"],
  limit: 10
});

// Search only Obsidian notes
const noteResults = await vectorBridge.searchContent({
  query: "meeting notes project",
  contentTypes: ["obsidian_note"],
  limit: 10
});
```

### 5. Filter by Channel

```javascript
const channelResults = await vectorBridge.searchContent({
  query: "latest updates",
  contentTypes: ["telegram_post"],
  filters: {
    "telegram.channelId": "@tech_news"
  },
  limit: 5
});
```

## Data Schema

### Content Types
- `telegram_post` - Messages from Telegram channels
- `telegram_comment` - Comments in Telegram chats  
- `obsidian_note` - Notes from Obsidian vault

### Metadata Structure

#### Telegram Posts
```json
{
  "telegram": {
    "channelId": "string",
    "channelTitle": "string", 
    "messageId": "number",
    "author": "string",
    "date": "ISO string",
    "views": "number",
    "forwards": "number"
  }
}
```

#### Obsidian Notes
```json
{
  "obsidian": {
    "filePath": "string",
    "fileName": "string",
    "folder": "string", 
    "tags": ["string"],
    "frontmatter": "object",
    "modifiedAt": "ISO string",
    "createdAt": "ISO string"
  }
}
```

## Troubleshooting

### Vector Service Not Available
- Check Qdrant is running on port 6333
- Verify OpenAI API key is set
- Restart GramJS server: `npm run gramjs-server`

### Search Returns No Results
- Check if content is vectorized: `GET /vector_stats`
- Lower score threshold in search request
- Verify content types and filters

### High OpenAI Costs
- Use `text-embedding-3-small` model (cheaper)
- Implement content deduplication before vectorizing
- Set reasonable limits on batch operations

### Performance Issues
- Index frequently filtered fields in Qdrant
- Use batch operations for multiple items
- Consider chunking very long content

## Integration with Commands

You can add custom commands to the plugin for common vector operations:

```typescript
// In commands.ts
this.addCommand({
  id: 'vectorize-current-note',
  name: 'Vectorize Current Note',
  callback: async () => {
    const file = this.app.workspace.getActiveFile();
    if (file) {
      const content = await this.app.vault.read(file);
      await this.vectorBridge.vectorizeNote({
        path: file.path,
        content: content,
        title: file.name
      });
    }
  }
});
```

## Best Practices

1. **Batch Operations**: Vectorize multiple items at once for efficiency
2. **Deduplication**: Check content hash before re-vectorizing
3. **Error Handling**: Always handle API failures gracefully
4. **Rate Limiting**: Respect OpenAI API rate limits
5. **Content Filtering**: Filter out low-quality or duplicate content
6. **Monitoring**: Track usage and costs via OpenAI dashboard