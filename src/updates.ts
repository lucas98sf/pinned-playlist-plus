import { VERSION } from "./constants";

const REPO = "lucas98sf/pinned-playlist-plus";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const KEY = `marketplace:installed:${REPO}/dist/pinned-playlist-plus.js`;
const OLD_KEY = `marketplace:installed:${REPO}/pinned-playlist-plus.js`;
const LIST = "marketplace:installed-extensions";
export interface Release {
  version: string;
  tag: string;
}

export function newerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
      throw new Error("Unsupported release version.");
    return value.split(".").map(Number);
  };
  const next = parse(candidate);
  const running = parse(current);
  for (let i = 0; i < 3; i++) {
    if (next[i] !== running[i]) return next[i] > running[i];
  }
  return false;
}

export async function latestRelease(
  request: typeof fetch = fetch,
): Promise<Release | null> {
  const response = await request(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Could not check updates (HTTP ${response.status}). Try again later.`,
    );
  const release: unknown = await response.json();
  if (
    !release ||
    typeof release !== "object" ||
    !("tag_name" in release) ||
    typeof release.tag_name !== "string" ||
    !("draft" in release) ||
    release.draft !== false ||
    !("prerelease" in release) ||
    release.prerelease !== false
  )
    throw new Error("GitHub returned an invalid stable release.");
  const tag = release.tag_name;
  if (!/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error("Unsupported release tag.");
  const version = tag.slice(1);
  return newerVersion(version, VERSION) ? { version, tag } : null;
}

/** Update only this extension's existing Marketplace record. Never create a second installation. */
export async function installRelease(
  release: Release,
  factory: IDBFactory = indexedDB,
): Promise<void> {
  if (
    release.tag !== `v${release.version}` ||
    !newerVersion(release.version, VERSION)
  )
    throw new Error("This release is not newer than the running version.");
  const bundle = await fetch(
    `https://cdn.jsdelivr.net/gh/${REPO}@${release.tag}/dist/pinned-playlist-plus.js`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (
    !bundle.ok ||
    !(await bundle.text()).startsWith(
      `/* Pinned Playlist Plus v${release.version} `,
    )
  )
    throw new Error(
      "The release download is not ready. Your installation is unchanged; try again later.",
    );
  const databases = await factory.databases();
  if (!databases.some((database) => database.name === "spicetify-marketplace"))
    throw new Error(
      "Manual installation: download the release and run install.ps1 -Update instead.",
    );
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("spicetify-marketplace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains("settings"))
      throw new Error(
        "Unsupported Marketplace storage. Update Marketplace first.",
      );
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      const requests = [store.get(KEY), store.get(OLD_KEY), store.get(LIST)];
      let loaded = 0;
      let failure: unknown;
      for (const request of requests)
        request.onsuccess = () => {
          if (++loaded !== requests.length) return;
          try {
            const stored = requests[0].result || requests[1].result;
            const listed: unknown = JSON.parse(
              requests[2].result?.value || "[]",
            );
            if (
              !stored ||
              !Array.isArray(listed) ||
              !listed.some((key) => key === KEY || key === OLD_KEY)
            )
              throw new Error(
                "Manual installation: download the release and run install.ps1 -Update instead.",
              );
            const record = JSON.parse(stored.value);
            if (
              record.user !== "lucas98sf" ||
              record.repo !== "pinned-playlist-plus"
            )
              throw new Error("Invalid Marketplace installation record.");
            record.manifest = {
              ...record.manifest,
              main: "dist/pinned-playlist-plus.js",
              version: release.version,
            };
            record.branch = release.tag;
            record.extensionURL = `https://raw.githubusercontent.com/${REPO}/${release.tag}/dist/pinned-playlist-plus.js`;
            store.put({ key: KEY, value: JSON.stringify(record) });
            store.delete(OLD_KEY);
            store.put({
              key: LIST,
              value: JSON.stringify([
                ...new Set(listed.map((key) => (key === OLD_KEY ? KEY : key))),
              ]),
            });
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(
          failure ||
            transaction.error ||
            new Error("Update could not be saved."),
        );
    });
  } finally {
    db.close();
  }
}
