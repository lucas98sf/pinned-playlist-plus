/** The Spicetify/Spotify surface this extension uses. Internal APIs stay at this boundary. */
export type SaveMode = "playlist" | "both";
export interface Settings {
  enabled: boolean;
  mode: SaveMode;
  separateHeart: boolean;
}
export type ToggleKey = Exclude<keyof Settings, "mode">;
export interface LibraryItem {
  uri: string;
  name?: string;
  pinned?: boolean;
  canAddTo?: boolean;
}
export interface PlaylistItem {
  uri: string;
  uid: string;
}
export interface SpotifyEvent {
  data?: { uri?: string; error?: unknown; isInLibrary?: boolean };
}
export type Cancel = () => void;
export type EventCallback = (event: SpotifyEvent) => void;
export interface EventBus {
  addListener(
    name: string,
    callback: EventCallback,
    options?: { uri: string },
  ): Cancel | void;
  removeListener?(name: string, callback: EventCallback): void;
}
export interface Platform {
  LibraryAPI: {
    getContents(options: {
      offset: number;
      limit: number;
    }): Promise<{ items: LibraryItem[] }>;
    contains(...uris: string[]): Promise<boolean[]>;
    add(options: { uris: string[] }): Promise<unknown>;
    remove(options: { uris: string[] }): Promise<unknown>;
    getEvents?(): EventBus;
  };
  PlaylistAPI: {
    getItem(playlist: string, track: string): Promise<PlaylistItem | null>;
    remove(playlist: string, tracks: PlaylistItem[]): Promise<unknown>;
    add(
      playlist: string,
      tracks: string[],
      position: { after: "end" },
    ): Promise<unknown>;
    getEvents?(): EventBus;
  };
  LocalStorageAPI: {
    getItem(key: string): unknown;
    setItem(key: string, value: Settings): void;
  };
  History?: {
    location?: { pathname?: string };
    listen(callback: () => void): Cancel;
  };
}
export interface Player {
  data?: { item?: { uri?: string } };
  addEventListener(name: string, callback: () => void): void;
  removeEventListener(name: string, callback: () => void): void;
}
export interface ReactFiber {
  memoizedProps?: {
    uri?: string;
    track?: { uri?: string };
    item?: { uri?: string };
    "data-testid"?: string;
    ""?: string;
    curateUri?: unknown;
    curateDefault?: unknown;
  };
  return?: ReactFiber;
  stateNode?: unknown;
}
export interface TooltipInstance {
  setContent(content: string): void;
  destroy(): void;
}
export interface TooltipRender {
  popper: HTMLElement;
  onUpdate?: (...args: unknown[]) => void;
}
export interface TooltipOptions {
  content: string;
  placement: "top";
  allowHTML: boolean;
  render(instance: TooltipInstance): TooltipRender;
}
export interface SaveButton extends HTMLButtonElement {
  _tippy?: TooltipInstance;
}
export interface ManagedControl {
  uri: string;
  primary: SaveButton;
  heart: SaveButton | null;
  group: HTMLSpanElement;
}
export interface Runtime {
  readonly version: string;
  configure(next: unknown): void;
  showSettings(): void;
  scan(): void;
  refreshStatus(force?: boolean): Promise<void>;
  dispose(): void;
}
export interface SpicetifyHost {
  Platform: Platform;
  Player: Player;
  Menu: {
    Item: new (
      name: string,
      enabled: boolean,
      onClick: () => void,
      icon: string,
    ) => { register(): void; deregister(): void };
  };
  PopupModal: {
    display(options: { title: string; content: HTMLElement }): void;
    hide(): void;
  };
  showNotification(message: string, error?: boolean): void;
  Tippy?(button: SaveButton, options: TooltipOptions): unknown;
  TippyProps: { render(instance: TooltipInstance): TooltipRender };
  React?: {
    createElement(
      component: unknown,
      props: Record<string, unknown>,
      children: string,
    ): unknown;
  };
  ReactDOM?: {
    render(element: unknown, container: HTMLElement): unknown;
    unmountComponentAtNode?(container: HTMLElement): unknown;
  };
  ReactComponent?: { ButtonPrimary?: unknown };
  ReactJSX?: { jsx?: unknown };
}
declare global {
  var Spicetify: SpicetifyHost | undefined;
  var PinnedPlaylistPlus: Runtime | undefined;
}
