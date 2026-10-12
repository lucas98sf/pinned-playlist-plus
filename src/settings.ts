import { DEFAULTS } from "./constants";
import type { Settings } from "./types";
export function settings(value?: unknown): Settings {
  const result = { ...DEFAULTS };
  if (value && typeof value === "object") {
    const stored = value as Record<string, unknown>;
    for (const key of ["enabled", "separateHeart"] as const) {
      if (typeof stored[key] === "boolean") result[key] = stored[key];
    }
    if (
      stored.mode === "playlist" ||
      stored.mode === "both" ||
      stored.mode === "liked"
    )
      result.mode = stored.mode;
  }
  return result;
}
