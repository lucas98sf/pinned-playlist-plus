import { start } from "./runtime";

function waitForSpicetify(): void {
  const S = globalThis.Spicetify;
  if (
    !S?.Platform?.PlaylistAPI?.getItem ||
    !S.Platform.LibraryAPI?.getContents ||
    !S.Platform.LocalStorageAPI ||
    !S.Player ||
    !S.Menu ||
    !S.ReactJSX?.jsx ||
    !S.PopupModal ||
    !document.body
  ) {
    setTimeout(waitForSpicetify, 500);
    return;
  }
  const runtime =
    globalThis.SaveToPlaylist || globalThis.PinnedPlaylistPlus || start(S);
  globalThis.SaveToPlaylist = runtime;
  // Older installed bundles use this alias to prevent duplicate initialization.
  globalThis.PinnedPlaylistPlus = runtime;
}
waitForSpicetify();
