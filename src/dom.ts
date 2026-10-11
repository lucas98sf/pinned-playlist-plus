import type { Player, ReactFiber } from "./types";
import { TRACK } from "./constants";
// Spotify stores private React fibers on DOM nodes. Keep the cast at this boundary.
function fiberFor(element: HTMLElement, key?: string): ReactFiber | undefined {
  return key
    ? (element as unknown as Record<string, ReactFiber | undefined>)[key]
    : undefined;
}
export const LEGACY_BUTTONS =
  'button.main-addButton-button, button.main-nowPlayingWidget-plusButton, button[data-testid="add-button"]';
const PLAYER_SCOPE =
  '.main-nowPlayingWidget-nowPlaying, .main-nowPlayingView-nowPlayingWidget, [data-testid="now-playing-widget"]';

export function isSaveButton(button: HTMLButtonElement): boolean {
  if (button.matches(LEGACY_BUTTONS)) return true;
  if (button.classList.contains("ppp-button")) return false;
  // New Spotify builds use generic Encore button classes. Identify the
  // curation component rather than its translated label or hashed CSS class.
  const boundary = button.closest(
    `[role="row"], .main-trackList-trackListRow, ${PLAYER_SCOPE}`,
  );
  const key = Object.keys(button).find((key) =>
    key.startsWith("__reactFiber$"),
  );
  for (
    let fiber = fiberFor(button, key), depth = 0;
    fiber && depth < 60;
    depth++, fiber = fiber.return
  ) {
    const props = fiber.memoizedProps;
    if (props?.["data-testid"] === "add-button" || props?.[""] === "add-button")
      return true;
    if (
      typeof props?.uri === "string" &&
      (typeof props.curateUri === "function" ||
        typeof props.curateDefault === "function")
    )
      return true;
    if (boundary && fiber.stateNode === boundary) break;
  }
  return false;
}

export function trackFor(
  button: HTMLButtonElement,
  player: Player,
): string | null {
  const row = button.closest('[role="row"], .main-trackList-trackListRow');
  if (!row && button.closest(PLAYER_SCOPE)) {
    const uri = player.data?.item?.uri;
    return uri && TRACK.test(uri) ? uri : null;
  }
  // Read only the clicked row's ancestors, never a different row or page context.
  for (
    let element: HTMLElement | null = button;
    element;
    element = element.parentElement
  ) {
    for (const key of Object.keys(element).filter((key) =>
      key.startsWith("__reactFiber$"),
    )) {
      let fiber = fiberFor(element, key);
      for (let depth = 0; fiber && depth < 60; depth++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        const uri = props?.uri || props?.track?.uri || props?.item?.uri;
        if (TRACK.test(uri || "")) return uri!;
        if (typeof uri === "string" && uri.startsWith("spotify:")) return null;
        if (fiber.stateNode === row) break;
      }
    }
    const uri = element.getAttribute("data-uri");
    if (TRACK.test(uri || "")) return uri;
    if (element === row) break;
  }
  return null;
}
