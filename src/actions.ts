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
  const pendingSaves = new Map<string, Promise<void>>();
  const pendingLikes = new Map<string, Promise<boolean>>();
  async function save(uri: string, config: Settings) {
    if (!TRACK.test(uri))
      throw new Error("This button supports Spotify songs only.");
    const destinations = [];
    if (config.mode !== "liked") {
      const playlist = await target(api);
      const key = `${playlist.uri}:${uri}`;
      if (!pendingSaves.has(key)) {
        const operation = (async () => {
          const existing = await api.PlaylistAPI.getItem(playlist.uri, uri);
          if (!existing)
            await api.PlaylistAPI.add(playlist.uri, [uri], { after: "end" });
        })();
        pendingSaves.set(key, operation);
        operation.finally(() => pendingSaves.delete(key)).catch(() => {});
      }
      await pendingSaves.get(key);
      destinations.push(playlist.name || "playlist");
    }
    if (config.mode !== "playlist") {
      try {
        await api.LibraryAPI.add({ uris: [uri] });
      } catch (error) {
        if (destinations.length)
          throw new Error(
            `Added to ${destinations[0]}, but Liked Songs failed: ${errorMessage(error)}`,
          );
        throw error;
      }
      destinations.push("Liked Songs");
    }
    return destinations;
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
