import type { Settings } from "./types";
import { version } from "../package.json";
export const VERSION = version;
export const NAME = "Save to Playlist";
export const REPO = "lucas98sf/spotify-plugin-save-to-playlist";
// Compatibility identifiers keep existing Marketplace installs and settings intact.
export const LEGACY_REPO = "lucas98sf/pinned-playlist-plus";
export const KEY = "pinned-playlist-plus:v1";
export const DEFAULTS: Settings = {
  enabled: true,
  mode: "playlist",
  destination: "first-pinned",
  separateHeart: true,
};
export const TRACK = /^spotify:track:[A-Za-z0-9]+$/;
export const PLAYLIST = /^spotify:playlist:[A-Za-z0-9]+$/;
export const ICONS = {
  plugin:
    '<path d="M1 2h12v1.5H1zm0 4h7v1.5H1zm0 4h5v1.5H1zm10-3h1.5v3H15v1.5h-2.5V14H11v-2.5H8.5V10H11z"/>',
  plus: '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM7.25 4v3.25H4v1.5h3.25V12h1.5V8.75H12v-1.5H8.75V4Z"/>',
  heart:
    '<path d="M8 14.4 1.7 8.1C-2 4.4 3.6-1.2 8 3.2c4.4-4.4 10 1.2 6.3 4.9L8 14.4Zm0-2.1 5.2-5.2c2.4-2.4-1.1-6-3.7-3.4L8 5.2 6.5 3.7C3.9 1.1.4 4.7 2.8 7.1Z"/>',
  heartFilled:
    '<path d="M8 14.4 1.7 8.1C-2 4.4 3.6-1.2 8 3.2c4.4-4.4 10 1.2 6.3 4.9L8 14.4Z"/>',
  check:
    '<path fill-rule="evenodd" d="M8 .5a7.5 7.5 0 1 0 0 15A7.5 7.5 0 0 0 8 .5ZM6.75 11.1l-3-3 1.06-1.06 1.94 1.94 4.44-4.44 1.06 1.06-5.5 5.5Z"/>',
};
