# Vector Search Usage Guide

This document describes the SQLite-based semantic search flow used by Kora.

## Prerequisites

1. SQLite semantic index path configured in plugin settings or via `SEMANTIC_DB_PATH`
2. OpenAI-compatible embeddings API key set in plugin settings or environment
3. GramJS server started with vector services enabled

```bash
npm run gramjs-server
```

## Environment Variables

```bash
export SEMANTIC_BACKEND="sqlite"
export SEMANTIC_DB_PATH="data/semantic-index.sqlite"
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
export EMBEDDING_MODEL="text-embedding-3-small"
```

## API Endpoints

- `POST /vectorize` - vectorize any content
- `POST /vectorize_messages` - vectorize Telegram messages from a channel
- `POST /search` - semantic search across indexed content
- `GET /content` - fetch indexed content by field
- `DELETE /content` - delete indexed content by field
- `GET /vector_stats` - semantic index statistics
- `GET /vector_health` - backend health check

## Notes

- Semantic search now uses a SQLite-backed index with FTS-based lexical boost.
- No external vector database or Docker container is required.
- Embeddings are still generated through the configured OpenAI-compatible endpoint.
