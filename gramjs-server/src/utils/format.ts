/**
 * Format utils: Helpers to format GramJS message objects.
 */

/**
 * JSDoc: Normalize a GramJS message object into a plain JSON that is safe to serialize.
 */
export function formatTelegramMessage(message: any): any {
  return {
    id: message.id,
    message: message.message || null,
    date: new Date(message.date * 1000).toISOString(),
    fromId: message.fromId?.userId?.toString() || null,
    peerId: message.peerId,
    out: message.out,
    mentioned: message.mentioned,
    mediaUnread: message.mediaUnread,
    silent: message.silent,
    post: message.post,
    fromScheduled: message.fromScheduled,
    legacy: message.legacy,
    editHide: message.editHide,
    pinned: message.pinned,
    noforwards: message.noforwards,
    media: message.media
      ? {
          className: message.media.className,
          document: message.media.document
            ? {
                id: message.media.document.id?.toString(),
                mimeType: message.media.document.mimeType,
                size: message.media.document.size,
              }
            : null,
          photo: message.media.photo
            ? {
                id: message.media.photo.id?.toString(),
                hasStickers: message.media.photo.hasStickers,
              }
            : null,
        }
      : null,
    views: message.views,
    forwards: message.forwards,
    replies: message.replies,
    editDate: message.editDate ? new Date(message.editDate * 1000).toISOString() : null,
    postAuthor: message.postAuthor,
    groupedId: message.groupedId?.toString() || null,
  };
}
