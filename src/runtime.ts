import { KEY, ICONS, TRACK, VERSION, NAME } from "./constants";
import { settings } from "./settings";
import { target, createActions, destinationLabel } from "./actions";
import { LEGACY_BUTTONS, isSaveButton, trackFor } from "./dom";
import { createSettingsView } from "./settings-view";
import { STYLES } from "./styles";
import { errorMessage } from "./errors";
import type {
  SpicetifyHost,
  Runtime,
  Settings,
  ManagedControl,
  Cancel,
  LibraryItem,
  SaveButton,
  EventBus,
  EventCallback,
} from "./types";
export function start(S: SpicetifyHost, doc: Document = document): Runtime {
  const api = S.Platform;
  const storage = api.LocalStorageAPI;
  let config: Settings;
  try {
    config = settings(storage.getItem(KEY));
  } catch {
    config = settings();
  }
  const actions = createActions(api);
  const managed = new Map<HTMLButtonElement, ManagedControl>();
  const membership = new Map<string, { present: boolean; time: number }>();
  const confirmedUntil = new Map<string, number>();
  const liked = new Map<string, boolean>();
  const likedVersions = new Map<string, number>();
  const unsubscribe: Cancel[] = [];
  let activeTarget: LibraryItem | null = null;
  let playlistSubscription: Cancel | null = null;
  let statusGeneration = 0;
  let configGeneration = 0;
  let disposed = false;
  const settingsView = createSettingsView(S, doc, () => config, configure);
  const showSettings = settingsView.show;
  let scheduled = false;
  const style = doc.createElement("style");
  style.textContent = STYLES;
  doc.head.append(style);
  function icon(button: SaveButton, name: keyof typeof ICONS) {
    if (button.dataset.pppIcon === name) return;
    button.dataset.pppIcon = name;
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`;
  }
  function notify(message: string, error = false) {
    S.showNotification(message, error);
  }
  function playlistLabel(present = false) {
    const destination = destinationLabel(config.destination).toLowerCase();
    return present
      ? `Remove from ${destination}`
      : `Add to ${destination}${config.mode === "both" ? " and Liked Songs" : ""}`;
  }
  function label(button: SaveButton, text: string) {
    if (button.getAttribute("aria-label") === text) return;
    button.setAttribute("aria-label", text);
    if (button._tippy) button._tippy.setContent(text);
    else button.title = text;
  }
  function remove(original: HTMLButtonElement, entry: ManagedControl) {
    entry.primary._tippy?.destroy();
    entry.heart?._tippy?.destroy();
    entry.group.remove();
    original.removeAttribute("data-ppp-hidden");
    managed.delete(original);
  }
  function makeButton(uri: string, kind: "primary" | "heart"): SaveButton {
    const button: SaveButton = doc.createElement("button");
    button.className = "ppp-button";
    button.type = "button";
    if (S.Tippy)
      S.Tippy(button, {
        ...S.TippyProps,
        content: "",
        placement: "top",
        allowHTML: false,
        render(instance) {
          const rendered = S.TippyProps.render(instance);
          rendered.popper.firstElementChild?.classList.add("ppp-tooltip");
          rendered.popper.firstElementChild?.setAttribute("role", "tooltip");
          return rendered;
        },
      });
    const isHeart = kind === "heart";
    icon(button, isHeart ? "heart" : "plus");
    label(button, isHeart ? "Add to Liked Songs" : playlistLabel());
    if (isHeart) button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      // Ignore any status read started before this action.
      statusGeneration++;
      const snapshot = { ...config };
      const savedConfigGeneration = configGeneration;
      try {
        if (isHeart) {
          const liked = await actions.toggleLike(uri);
          updateHearts(uri, liked);
          notify(liked ? "Added to Liked Songs" : "Removed from Liked Songs");
        } else {
          const results = await actions.save(
            uri,
            snapshot,
            (playlist, present) => {
              if (disposed || savedConfigGeneration !== configGeneration)
                return;
              // Spotify's membership index can lag behind a successful write.
              // Render the confirmed result immediately and invalidate older reads.
              statusGeneration++;
              if (activeTarget?.uri !== playlist.uri) {
                membership.clear();
                confirmedUntil.clear();
                activeTarget = playlist;
                watchPlaylist(playlist.uri);
              }
              membership.set(uri, { present, time: Date.now() });
              confirmedUntil.set(uri, Date.now() + 5000);
              renderStatus();
            },
          );
          notify(
            results
              .map(({ action, destination }) => `${action} ${destination}`)
              .join("; "),
          );
          if (snapshot.mode === "both") updateHearts(uri, true);
        }
      } catch (error) {
        console.error(`[${NAME}]`, error);
        notify(errorMessage(error) || "Could not save this song.", true);
      } finally {
        button.disabled = false;
        void refreshStatus(true);
      }
    });
    return button;
  }
  function updateHearts(uri: string, value: boolean) {
    // The heart action and library events are independent of playlist status.
    // Keep the cache in sync so new instances of this song render correctly.
    likedVersions.set(uri, (likedVersions.get(uri) || 0) + 1);
    setLiked(uri, value);
  }
  function setLiked(uri: string, value: boolean) {
    liked.set(uri, value);
    for (const entry of managed.values()) {
      if (entry.uri !== uri) continue;
      const heart = entry.heart;
      if (!heart) continue;
      heart.setAttribute("aria-pressed", String(value));
      icon(heart, value ? "heartFilled" : "heart");
      label(heart, value ? "Remove from Liked Songs" : "Add to Liked Songs");
    }
  }
  function renderStatus() {
    const path = api.History?.location?.pathname || "";
    const page = path.match(/^\/playlist\/([A-Za-z0-9]+)(?:\/|$)/);
    const onTargetPage =
      page && activeTarget?.uri === `spotify:playlist:${page[1]}`;
    for (const [original, entry] of managed) {
      const present = membership.get(entry.uri)?.present;
      const row = original.closest(
        '[role="row"], .main-trackList-trackListRow',
      );
      // Keep the player and side-panel controls. Only suppress redundant
      // playlist actions in rows of the destination playlist itself.
      entry.primary.hidden = !!(
        onTargetPage &&
        present &&
        row &&
        !row.closest('aside, [data-testid="queue"]')
      );
      entry.primary.setAttribute("aria-pressed", String(present === true));
      icon(entry.primary, present ? "check" : "plus");
      label(entry.primary, playlistLabel(present));
      entry.group.hidden = entry.primary.hidden && !entry.heart;
      if (liked.has(entry.uri)) setLiked(entry.uri, liked.get(entry.uri)!);
    }
  }
  function listen(
    events: EventBus | undefined,
    name: string,
    callback: EventCallback,
    options?: { uri: string },
  ): Cancel {
    if (!events?.addListener) return () => {};
    const cancel = events.addListener(name, callback, options);
    return typeof cancel === "function"
      ? cancel
      : () => events.removeListener?.(name, callback);
  }
  function watchPlaylist(uri?: string | null) {
    playlistSubscription?.();
    playlistSubscription = uri
      ? listen(
          api.PlaylistAPI.getEvents?.(),
          "update",
          (event) => {
            if (!event?.data?.uri || event.data.uri === activeTarget?.uri)
              void refreshStatus(true);
          },
          { uri },
        )
      : null;
  }
  async function refreshStatus(force = false) {
    if (disposed || !config.enabled || !managed.size) return;
    const generation = ++statusGeneration;
    const uris = [...new Set([...managed.values()].map((entry) => entry.uri))];
    const versions = new Map(
      uris.map((uri) => [uri, likedVersions.get(uri) || 0]),
    );
    let resolvedTarget = false;
    try {
      const playlist = await target(api, config.destination);
      resolvedTarget = true;
      if (disposed || generation !== statusGeneration) return;
      if (playlist?.uri !== activeTarget?.uri) {
        membership.clear();
        confirmedUntil.clear();
        activeTarget = playlist;
        watchPlaylist(playlist?.uri);
        renderStatus();
      }
      const found = new Map<string, boolean>();
      // Limit reads for virtualized track lists; cache membership between
      // scans, and invalidate it immediately when Spotify reports an edit.
      const queue = uris.filter(
        (uri) =>
          playlist &&
          Date.now() >= (confirmedUntil.get(uri) || 0) &&
          (force ||
            !membership.has(uri) ||
            Date.now() - membership.get(uri)!.time > 30000),
      );
      const readPlaylist = Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length && generation === statusGeneration && !disposed) {
            const uri = queue.shift()!;
            const item = await api.PlaylistAPI.getItem(playlist!.uri, uri);
            found.set(uri, !!item);
          }
        }),
      );
      const [values] = await Promise.all([
        api.LibraryAPI.contains(...uris),
        readPlaylist,
      ]);
      if (disposed || generation !== statusGeneration) return;
      for (const [uri, present] of found)
        membership.set(uri, { present, time: Date.now() });
      uris.forEach((uri, index) => {
        if ((likedVersions.get(uri) || 0) === versions.get(uri))
          liked.set(uri, values[index]);
      });
      renderStatus();
    } catch (error) {
      if (!resolvedTarget && !disposed && generation === statusGeneration) {
        activeTarget = null;
        membership.clear();
        confirmedUntil.clear();
        watchPlaylist(null);
        renderStatus();
      }
      console.warn(`[${NAME}] Could not refresh saved state`, error);
    }
  }
  function scan() {
    scheduled = false;
    if (disposed) return;
    settingsView.cleanDetached();
    for (const [original, entry] of managed) {
      if (
        !config.enabled ||
        !original.isConnected ||
        !entry.primary.isConnected ||
        !isSaveButton(original) ||
        trackFor(original, S.Player) !== entry.uri
      )
        remove(original, entry);
    }
    if (!config.enabled) return;
    const selector = `${LEGACY_BUTTONS}, button[aria-checked]`;
    const created = new Set();
    for (const original of doc.querySelectorAll<HTMLButtonElement>(selector)) {
      if (original.disabled || managed.has(original) || !isSaveButton(original))
        continue;
      const uri = trackFor(original, S.Player);
      if (!uri) continue;
      const primary = makeButton(uri, "primary");
      const heart = config.separateHeart ? makeButton(uri, "heart") : null;
      const group = doc.createElement("span");
      group.className = "ppp-controls";
      group.append(primary);
      if (heart) group.append(heart);
      original.after(group);
      original.setAttribute("data-ppp-hidden", "");
      managed.set(original, { uri, primary, heart, group });
      created.add(uri);
    }
    renderStatus();
    if (created.size) void refreshStatus();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 100);
  }
  function configure(next: unknown) {
    config = settings(next);
    configGeneration++;
    statusGeneration++;
    activeTarget = null;
    membership.clear();
    confirmedUntil.clear();
    watchPlaylist(null);
    storage.setItem(KEY, config);
    for (const [original, entry] of managed) remove(original, entry);
    scan();
  }
  const menu = new S.Menu.Item(
    `${NAME} settings`,
    false,
    showSettings,
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${ICONS.plugin}</svg>`,
  );
  menu.register();
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-uri", "disabled"],
  });
  S.Player.addEventListener("songchange", schedule);
  if (api.History?.listen)
    unsubscribe.push(
      api.History.listen(() => {
        renderStatus();
        schedule();
        void refreshStatus();
      }),
    );
  const playlistEvents = api.PlaylistAPI.getEvents?.();
  unsubscribe.push(
    listen(playlistEvents, "operation_complete", (event) => {
      if (
        !event.data?.error &&
        (config.destination === "recently-updated" ||
          event.data?.uri === activeTarget?.uri)
      )
        void refreshStatus(true);
    }),
  );
  const libraryEvents = api.LibraryAPI.getEvents?.();
  unsubscribe.push(
    listen(libraryEvents, "update_pin", () => {
      membership.clear();
      confirmedUntil.clear();
      void refreshStatus(true);
    }),
  );
  unsubscribe.push(
    listen(libraryEvents, "update", () => void refreshStatus(true)),
  );
  unsubscribe.push(
    listen(libraryEvents, "update_item", (event) => {
      if (
        TRACK.test(event.data?.uri || "") &&
        typeof event.data?.isInLibrary === "boolean"
      ) {
        updateHearts(event.data!.uri!, event.data!.isInLibrary!);
      }
    }),
  );
  // Cross-device changes may not generate a local operation event.
  const refreshTimer = setInterval(() => void refreshStatus(), 15000);
  refreshTimer.unref?.();
  scan();
  return {
    version: VERSION,
    configure,
    showSettings,
    scan,
    refreshStatus,
    dispose() {
      disposed = true;
      statusGeneration++;
      clearInterval(refreshTimer);
      settingsView.dispose();
      playlistSubscription?.();
      unsubscribe.forEach((cancel) => cancel?.());
      observer.disconnect();
      S.Player.removeEventListener("songchange", schedule);
      menu.deregister();
      style.remove();
      for (const [original, entry] of managed) remove(original, entry);
    },
  };
}
