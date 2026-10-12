import { DEFAULTS } from "./constants";
import type { Settings } from "./types";
export function settings(value?: unknown): Settings {
  const result = { ...DEFAULTS };
  if (value && typeof value === "object") {
    const stored = value as Record<string, unknown>;
    for (const key of ["enabled", "separateHeart"] as const) {
      if (typeof stored[key] === "boolean") result[key] = stored[key];
    }
    if (stored.mode === "playlist" || stored.mode === "both")
      result.mode = stored.mode;
    // The removed Liked Songs-only mode is equivalent to disabling the extension.
    if (stored.mode === "liked") result.enabled = false;
  }
  return result;
}
