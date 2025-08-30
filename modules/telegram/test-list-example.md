---
post_ids: [123, 456, 789]
channel_id: '@your_channel_username'
channel_name: 'My Test Channel'
---

# Example Note List for Position-Based Sync

This is a test file to demonstrate the position-based sync functionality with channel configuration in frontmatter.

## Note List

- [[Пост 1]] - First post
- [[Пост 2|Custom display name]] - Second post with custom display
- [[Пост 3]] - Third post

## How to use:

1. Update the `channel_id` in frontmatter to your actual Telegram channel
2. Use the command "Preview note list sync changes" to see what would happen
3. Use the command "Sync note list to Telegram (position-based)" to execute the sync
4. The `post_ids` frontmatter field will be updated with message IDs in positional order

## Expected behavior:

- Position 0: [[Пост 1]] → post_ids[0]
- Position 1: [[Пост 2]] → post_ids[1]
- Position 2: [[Пост 3]] → post_ids[2]

If you reorder the list, the posts in Telegram will be updated to match the new order.

## Frontmatter Configuration:

```yaml
---
post_ids: [] # Array of message IDs (auto-updated)
channel_id: '@your_channel_username' # Telegram channel ID or username
channel_name: 'My Test Channel' # Display name for the channel (optional)
---
```
