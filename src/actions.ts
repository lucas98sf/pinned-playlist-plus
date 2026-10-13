import { TRACK, PLAYLIST } from "./constants";
import { errorMessage } from "./errors";
import type { Platform, LibraryItem, Settings, Destination } from "./types";
export function destinationLabel(destination: Destination): string {
  return destination === "recently-updated"
    ? "Most recently updated playlist"
    : "First pinned playlist";
}

const RECENT_SORT = "5";
const PLAYLIST_FILTER = "2";
const RECENT_UNAVAILABLE =
  "Spotify could not reliably determine the most recently updated playlist. Try again or select First pinned playlist.";

async function recentlyUpdated(api: Platform): Promise<LibraryItem> {
  const client = api.LibraryAPI._your_library;
  if (!client?.all) throw new Error(RECENT_UNAVAILABLE);
  // The public API groups pins first and does not expose ignorePinning.
  // Use its normal request builder and response mapper on an isolated receiver;
  // only this resolver's requests change, never Spotify's library or other extensions.
  const library = Object.create(api.LibraryAPI) as Platform["LibraryAPI"];
  library._your_library = {
    all: (request) =>
      client.all({
        ...request,
        header: { ...request.header, ignorePinning: true },
      }),
  };
  const seen = new Set<string>();
  let latest: LibraryItem | undefined;
  for (let offset = 0; ; offset += 100) {
    const response = await library.getContents({
      offset,
      limit: 100,
      filters: [PLAYLIST_FILTER],
      sortOrder: RECENT_SORT,
      flattenTree: true,
    });
    if (
      !Array.isArray(response?.items) ||
      response.selectedSortOrder?.id !== RECENT_SORT
    )
      throw new Error(RECENT_UNAVAILABLE);
    let added = 0;
    for (const item of response.items) {
      if (!item || typeof item.uri !== "string")
        throw new Error(RECENT_UNAVAILABLE);
      if (!seen.has(item.uri)) {
        seen.add(item.uri);
        added++;
      }
      if (!latest && PLAYLIST.test(item.uri) && item.canAddTo === true)
        latest = item;
    }
    if (
      response.totalLength !== undefined &&
      (!Number.isSafeInteger(response.totalLength) || response.totalLength < 0)
    )
      throw new Error(RECENT_UNAVAILABLE);
    const complete =
      response.totalLength === undefined
        ? response.items.length < 100
        : offset + response.items.length >= response.totalLength;
    if (complete) break;
    if (!added || response.items.length !== 100)
      throw new Error(RECENT_UNAVAILABLE);
  }
  if (!latest)
    throw new Error(
      "No editable playlist found in Your Library. Create or save a playlist you can modify.",
    );
  return latest;
}

export async function target(
  api: Platform,
  destination: Destination = "first-pinned",
): Promise<LibraryItem> {
  if (destination === "recently-updated") {
    try {
      return await recentlyUpdated(api);
    } catch (error) {
      const message = errorMessage(error);
      if (
        message.startsWith("No editable playlist") ||
        message === RECENT_UNAVAILABLE
      )
        throw error;
      throw new Error(`${RECENT_UNAVAILABLE} ${message}`);
    }
  }
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
    const playlist = await target(api, config.destination);
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
    if (config.mode === "both") {
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
