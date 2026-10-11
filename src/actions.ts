import { TRACK, PLAYLIST } from "./constants";
import { errorMessage } from "./errors";
import type { Platform, LibraryItem, Settings } from "./types";
export async function target(api: Platform): Promise<LibraryItem> {
  // Use Spotify's default library order, which places pins first in pin order.
  // CUSTOM (4) is only valid with a playlist filter, not the mixed library.
  const response = await api.LibraryAPI.getContents({ offset: 0, limit: 100 });
  if (!Array.isArray(response?.items))
    throw new Error("Spotify returned an unsupported library response.");
  const first = response.items.find(
    (item) => item?.pinned && PLAYLIST.test(item.uri),
  );
  if (!first)
    throw new Error(
      "Pin a playlist in Your Library. The first pinned playlist is used.",
    );
  if (first.canAddTo === false)
    throw new Error(
      `You cannot add songs to “${first.name}”. Move an editable playlist to the first pinned position.`,
    );
  return first;
}

export function createActions(api: Platform) {
  const pendingSaves = new Map<string, Promise<boolean>>();
  const pendingLikes = new Map<string, Promise<boolean>>();
  async function save(
    uri: string,
    config: Settings,
    onPlaylistChange?: (playlist: LibraryItem, present: boolean) => void,
  ) {
    if (!TRACK.test(uri))
      throw new Error("This button supports Spotify songs only.");
    const actions: {
      action: "Added to" | "Removed from";
      destination: string;
    }[] = [];
    if (config.mode !== "liked") {
      const playlist = await target(api);
      const key = `${playlist.uri}:${uri}`;
      if (!pendingSaves.has(key)) {
        const operation = (async () => {
          const existing = await api.PlaylistAPI.getItem(playlist.uri, uri);
          if (existing) {
            if (typeof existing.uid !== "string" || !existing.uid)
              throw new Error(
                "Spotify did not provide a playlist entry ID for this song.",
              );
            await api.PlaylistAPI.remove(playlist.uri, [
              { uri, uid: existing.uid },
            ]);
            return true;
          }
          await api.PlaylistAPI.add(playlist.uri, [uri], { after: "end" });
          return false;
        })();
        pendingSaves.set(key, operation);
        operation.finally(() => pendingSaves.delete(key)).catch(() => {});
      }
      const removed = await pendingSaves.get(key)!;
      onPlaylistChange?.(playlist, !removed);
      actions.push({
        action: removed ? "Removed from" : "Added to",
        destination: playlist.name || "playlist",
      });
    }
    if (config.mode !== "playlist") {
      try {
        await api.LibraryAPI.add({ uris: [uri] });
      } catch (error) {
        if (actions.length)
          throw new Error(
            `${actions[0].action} ${actions[0].destination}, but adding to Liked Songs failed: ${errorMessage(error)}`,
          );
        throw error;
      }
      actions.push({ action: "Added to", destination: "Liked Songs" });
    }
    return actions;
  }
  async function toggleLike(uri: string): Promise<boolean> {
    const existing = pendingLikes.get(uri);
    if (existing) return existing;
    const operation = (async () => {
      const [liked] = await api.LibraryAPI.contains(uri);
      await api.LibraryAPI[liked ? "remove" : "add"]({ uris: [uri] });
      return !liked;
    })();
    pendingLikes.set(uri, operation);
    try {
      return await operation;
    } finally {
      pendingLikes.delete(uri);
    }
  }
  return { save, toggleLike };
}
