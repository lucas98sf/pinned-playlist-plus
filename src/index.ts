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
  if (!globalThis.PinnedPlaylistPlus) globalThis.PinnedPlaylistPlus = start(S);
}
waitForSpicetify();
