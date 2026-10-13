const { test } = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const {
  newerVersion,
  latestRelease,
  installRelease,
} = require("../.test-build/extension.cjs");
const { version } = require("../package.json");
const root = "marketplace:installed:lucas98sf/pinned-playlist-plus/";
const oldKey = root + "pinned-playlist-plus.js";
const newKey = root + "dist/pinned-playlist-plus.js";
const listKey = "marketplace:installed-extensions";
const release = { version: "9.0.0", tag: "v9.0.0" };

test("semantic version comparisons handle numeric parts and reject malformed versions", () => {
  assert.equal(newerVersion("1.10.0", "1.9.9"), true);
  assert.equal(newerVersion("2.0.0", "1.99.99"), true);
  assert.equal(newerVersion(version, version), false);
  assert.equal(newerVersion("1.0.0", "1.1.0"), false);
  assert.throws(() => newerVersion("1.2.3-beta", version));
  assert.throws(() => newerVersion("01.2.3", version));
});

test("release checks accept only newer stable versions and report network errors", async () => {
  const response =
    (tag_name, extras = {}) =>
    async () =>
      new Response(
        JSON.stringify({
          tag_name,
          draft: false,
          prerelease: false,
          ...extras,
        }),
      );
  assert.deepEqual(await latestRelease(response("v9.0.0")), release);
  assert.equal(await latestRelease(response(`v${version}`)), null);
  await assert.rejects(
    latestRelease(response("v9.0.0", { prerelease: true })),
    /invalid stable release/,
  );
  await assert.rejects(
    latestRelease(response("v9.0.0/path")),
    /Unsupported release tag/,
  );
  await assert.rejects(
    latestRelease(async () => new Response("", { status: 403 })),
    /HTTP 403/,
  );
});

async function setup(entries) {
  const factory = new IDBFactory();
  const db = await new Promise((resolve) => {
    const request = factory.open("spicetify-marketplace", 2);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("settings", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise((resolve) => {
    const transaction = db.transaction("settings", "readwrite");
    for (const [key, value] of entries)
      transaction
        .objectStore("settings")
        .put({ key, value: JSON.stringify(value) });
    transaction.oncomplete = resolve;
  });
  return {
    factory,
    db,
    read: (key) =>
      new Promise((resolve) => {
        const request = db
          .transaction("settings")
          .objectStore("settings")
          .get(key);
        request.onsuccess = () =>
          resolve(
            request.result ? JSON.parse(request.result.value) : undefined,
          );
      }),
  };
}

test("Marketplace update migrates only this entry, pins the release and preserves other extensions", async () => {
  const record = {
    user: "lucas98sf",
    repo: "pinned-playlist-plus",
    manifest: { main: "pinned-playlist-plus.js" },
    title: "Pinned Playlist Plus",
  };
  const store = await setup([
    [oldKey, record],
    [listKey, [oldKey, "other-extension"]],
    ["other-extension", { untouched: true }],
  ]);
  const previousFetch = global.fetch;
  global.fetch = async () =>
    new Response("/* Pinned Playlist Plus v9.0.0 - generated */");
  try {
    await installRelease(release, store.factory);
    assert.equal(await store.read(oldKey), undefined);
    const updated = await store.read(newKey);
    assert.equal(updated.branch, release.tag);
    assert.equal(updated.manifest.version, release.version);
    assert.equal(updated.manifest.main, "dist/pinned-playlist-plus.js");
    assert.equal(updated.manifest.name, "Save to Playlist");
    assert.equal(updated.title, "Save to Playlist");
    assert.equal(
      updated.extensionURL,
      "https://raw.githubusercontent.com/lucas98sf/pinned-playlist-plus/v9.0.0/dist/pinned-playlist-plus.js",
    );
    assert.deepEqual(await store.read(listKey), [newKey, "other-extension"]);
    assert.deepEqual(await store.read("other-extension"), { untouched: true });
  } finally {
    global.fetch = previousFetch;
    store.db.close();
  }
});

test("unavailable download and malformed storage never change an installation", async () => {
  const record = { user: "wrong-user", repo: "pinned-playlist-plus" };
  const store = await setup([
    [newKey, record],
    [listKey, [newKey]],
  ]);
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => new Response("404", { status: 404 });
    await assert.rejects(
      installRelease(release, store.factory),
      /download is not ready/,
    );
    assert.deepEqual(await store.read(newKey), record);
    global.fetch = async () =>
      new Response("/* Pinned Playlist Plus v9.0.0 - generated */");
    await assert.rejects(
      installRelease(release, store.factory),
      /Invalid Marketplace/,
    );
    assert.deepEqual(await store.read(newKey), record);
    await assert.rejects(
      installRelease(release, new IDBFactory()),
      /Manual installation/,
    );
  } finally {
    global.fetch = previousFetch;
    store.db.close();
  }
});
