const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  settings,
  target,
  createActions,
  isSaveButton,
  start,
  trackFor,
} = require("../.test-build/extension.cjs");
const song = "spotify:track:abc123";
const playlist = "spotify:playlist:first";

function eventBus() {
  const handlers = new Map();
  return {
    addListener(name, callback) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(callback);
      return () => handlers.get(name).delete(callback);
    },
    emit(name, data) {
      for (const callback of handlers.get(name) || []) callback({ data });
    },
    size() {
      return [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

function platform() {
  const calls = [];
  let liked = false;
  const tracks = new Set();
  const playlistEvents = eventBus();
  const libraryEvents = eventBus();
  const api = {
    LibraryAPI: {
      getEvents: () => libraryEvents,
      getContents: async (options) => {
        // Match the real client restriction that caused the reported failure.
        if (options.sortOrder === "4" && !options.filters?.length)
          throw new Error('"Custom sort" is not a valid YLX sort order.');
        calls.push(["library", options]);
        return {
          items: [
            { uri: "spotify:collection:tracks", pinned: true },
            { uri: "spotify:playlist:unpinned", pinned: false },
            { uri: playlist, name: "First", pinned: true, canAddTo: true },
            { uri: "spotify:playlist:second", name: "Second", pinned: true },
          ],
        };
      },
      contains: async (...uris) => uris.map(() => liked),
      add: async (value) => {
        calls.push(["like", value]);
        liked = true;
      },
      remove: async (value) => {
        calls.push(["unlike", value]);
        liked = false;
      },
    },
    PlaylistAPI: {
      getEvents: () => playlistEvents,
      getMetadata: async (uri) => ({ uri, name: "Override", canAdd: true }),
      getItem: async (uri, track) =>
        tracks.has(`${uri}:${track}`)
          ? { uri: track, uid: `row-${track}` }
          : null,
      add: async (uri, uris, position) => {
        calls.push(["playlist", uri, uris, position]);
        uris.forEach((track) => tracks.add(`${uri}:${track}`));
      },
      remove: async (uri, items) => {
        for (const item of items) assert.equal(item.uid, `row-${item.uri}`);
        calls.push(["removePlaylist", uri, items]);
        items.forEach((item) => tracks.delete(`${uri}:${item.uri}`));
      },
    },
    LocalStorageAPI: {
      getItem: () => null,
      setItem: (...args) => calls.push(["storage", ...args]),
    },
  };
  return { api, calls, tracks, playlistEvents, libraryEvents };
}

test("validates saved options and discards previously saved playlist overrides", () => {
  assert.equal(
    settings({ mode: "invalid", enabled: "false", playlist: "bad" }).mode,
    "playlist",
  );
  assert.equal(settings({ enabled: false }).enabled, false);
  assert.equal(
    "playlist" in settings({ playlist: "spotify:playlist:override" }),
    false,
  );
});

test("selects the first pinned playlist, ignoring Liked Songs and unpinned items", async () => {
  const { api, calls } = platform();
  assert.equal((await target(api)).uri, playlist);
  assert.deepEqual(calls[0][1], { offset: 0, limit: 100 });
});

test("fails clearly for absent pins and an uneditable first pin", async () => {
  const { api } = platform();
  api.LibraryAPI.getContents = async () => ({ items: [] });
  await assert.rejects(target(api, settings()), /Pin a playlist/);
  api.LibraryAPI.getContents = async () => ({
    items: [
      { uri: playlist, pinned: true, canAddTo: false, name: "Read only" },
    ],
  });
  await assert.rejects(target(api, settings()), /cannot add/);
});

test("playlist-only button toggles playlist membership and avoids concurrent duplicates", async () => {
  const { api, calls } = platform();
  const actions = createActions(api);
  await Promise.all([
    actions.save(song, settings()),
    actions.save(song, settings()),
  ]);
  await actions.save(song, settings());
  assert.equal(calls.filter((call) => call[0] === "playlist").length, 1);
  assert.equal(calls.filter((call) => call[0] === "removePlaylist").length, 1);
  assert.equal(calls.filter((call) => call[0] === "like").length, 0);
  assert.deepEqual(calls.find((call) => call[0] === "playlist").slice(1), [
    playlist,
    [song],
    { after: "end" },
  ]);
  assert.deepEqual(
    calls.find((call) => call[0] === "removePlaylist").slice(1),
    [playlist, [{ uri: song, uid: `row-${song}` }]],
  );
});

test("both destinations and independent heart toggling", async () => {
  const { api, calls } = platform();
  const actions = createActions(api);
  await actions.save(song, settings({ mode: "both" }));
  assert.equal(calls.filter((call) => call[0] === "like").length, 1);
  assert.equal(await actions.toggleLike(song), false);
  assert.equal(await actions.toggleLike(song), true);
  await assert.rejects(
    actions.save("spotify:episode:abc", settings()),
    /songs only/,
  );
});

test("reports partial success accurately and never likes after a playlist failure", async () => {
  const { api, calls } = platform();
  api.PlaylistAPI.add = async () => {
    throw new Error("Offline");
  };
  await assert.rejects(
    createActions(api).save(song, settings({ mode: "both" })),
    /Offline/,
  );
  assert.equal(calls.filter((call) => call[0] === "like").length, 0);
  api.PlaylistAPI.add = async () => {};
  api.LibraryAPI.add = async () => {
    throw new Error("Offline");
  };
  await assert.rejects(
    createActions(api).save(song, settings({ mode: "both" })),
    /Added to First, but adding to Liked Songs failed/,
  );
});

test("replaces song controls, restores native buttons when off, and follows recycled rows", async () => {
  const dom = new JSDOM(
    '<!doctype html><body><div role="row" data-uri="spotify:track:abc123"><button class="main-addButton-button">+</button></div><div data-uri="spotify:album:album"><button class="main-addButton-button">+</button></div></body>',
  );
  global.MutationObserver = dom.window.MutationObserver;
  const { api, calls } = platform();
  const notices = [];
  const S = {
    Platform: api,
    Player: { data: {}, addEventListener() {}, removeEventListener() {} },
    Menu: {
      Item: class {
        register() {}
        deregister() {}
      },
    },
    PopupModal: { display() {}, hide() {} },
    showNotification: (...args) => notices.push(args),
  };
  const runtime = start(S, dom.window.document);
  const doc = dom.window.document;
  const original = doc.querySelector('div[role="row"] button');
  assert.ok(original.hasAttribute("data-ppp-hidden"));
  assert.equal(doc.querySelectorAll(".ppp-button").length, 2);
  assert.equal(
    doc
      .querySelector('[data-uri^="spotify:album"] button')
      .hasAttribute("data-ppp-hidden"),
    false,
  );
  doc.querySelector(".ppp-button").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls.filter((call) => call[0] === "playlist").length, 1);
  assert.match(notices[0][0], /First/);
  original.parentElement.setAttribute("data-uri", "spotify:track:newSong");
  runtime.scan();
  doc.querySelector(".ppp-button").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls.filter((call) => call[0] === "playlist")[1][2], [
    "spotify:track:newSong",
  ]);
  runtime.configure({ enabled: false });
  assert.equal(doc.querySelectorAll(".ppp-button").length, 0);
  assert.equal(original.hasAttribute("data-ppp-hidden"), false);
  runtime.dispose();
  dom.window.close();
});

test("track lookup uses the clicked row instead of the currently playing song", () => {
  const dom = new JSDOM(
    '<div role="row"><button class="main-addButton-button"></button></div><div class="main-nowPlayingWidget-nowPlaying"><button></button></div>',
  );
  const rowButton = dom.window.document.querySelector('[role="row"] button');
  rowButton.__reactFiber$test = {
    memoizedProps: {},
    return: { memoizedProps: { track: { uri: song } } },
  };
  const player = { data: { item: { uri: "spotify:track:playing" } } };
  assert.equal(trackFor(rowButton, player), song);
  assert.equal(
    trackFor(
      dom.window.document.querySelector(
        ".main-nowPlayingWidget-nowPlaying button",
      ),
      player,
    ),
    "spotify:track:playing",
  );
  dom.window.close();
});

test("settings name the first pinned playlist automatically and offer no override", async () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  global.MutationObserver = dom.window.MutationObserver;
  const { api, calls } = platform();
  api.LocalStorageAPI.getItem = () => ({
    playlist: "spotify:playlist:oldOverride",
    mode: "both",
  });
  let modal;
  const S = {
    Platform: api,
    Player: { data: {}, addEventListener() {}, removeEventListener() {} },
    Menu: {
      Item: class {
        register() {}
        deregister() {}
      },
    },
    PopupModal: {
      display: (value) => {
        modal = value;
      },
      hide() {},
    },
    showNotification() {},
  };
  const runtime = start(S, dom.window.document);
  runtime.showSettings();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(
    modal.content.textContent,
    /Uses the first pinned playlist in Your Library/,
  );
  assert.equal(
    modal.content.querySelector('[role="status"]').textContent,
    "First pinned playlist: First",
  );
  assert.equal(modal.content.querySelector('input[type="text"]'), null);
  assert.equal(modal.content.querySelectorAll("button").length, 2);
  assert.match(modal.content.textContent, /Check for updates/);
  modal.content.querySelector("button").click();
  const saved = calls.find((call) => call[0] === "storage")[2];
  assert.equal(saved.mode, "both");
  assert.equal("playlist" in saved, false);
  runtime.dispose();
  dom.window.close();
});

test("Spotify's generic Encore curation button gets playlist and heart controls without capturing repeat", async () => {
  const dom = new JSDOM(
    '<!doctype html><body><div data-testid="now-playing-widget"><button class="e-10860-legacy-button" aria-checked="false" aria-label="Add to Liked Songs"></button><button class="e-10860-legacy-button" aria-checked="false" aria-label="Enable repeat" role="checkbox"></button></div></body>',
  );
  global.MutationObserver = dom.window.MutationObserver;
  const doc = dom.window.document;
  const [original, repeat] = doc.querySelectorAll("button");
  const boundary = { stateNode: original.parentElement, memoizedProps: {} };
  let chain = {
    memoizedProps: { uri: song, curateUri() {}, isCurated: false },
    return: boundary,
  };
  // The live client nests the curation props behind 19 tooltip/menu components.
  for (let i = 0; i < 19; i++) chain = { memoizedProps: {}, return: chain };
  original.__reactFiber$current = chain;
  repeat.__reactFiber$current = {
    memoizedProps: { role: "checkbox" },
    return: boundary,
  };
  assert.equal(isSaveButton(original), true);
  assert.equal(isSaveButton(repeat), false);
  let nativeClicks = 0;
  original.onclick = () => nativeClicks++;
  const { api, calls } = platform();
  const S = {
    Platform: api,
    Player: {
      data: { item: { uri: song } },
      addEventListener() {},
      removeEventListener() {},
    },
    Menu: {
      Item: class {
        register() {}
        deregister() {}
      },
    },
    PopupModal: { display() {}, hide() {} },
    showNotification() {},
  };
  const runtime = start(S, doc);
  const [plus, heart] = doc.querySelectorAll(".ppp-button");
  assert.ok(original.hasAttribute("data-ppp-hidden"));
  assert.equal(repeat.hasAttribute("data-ppp-hidden"), false);
  assert.equal(plus.title, "Add to first pinned playlist");
  assert.equal(heart.title, "Add to Liked Songs");
  plus.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.filter((call) => call[0] === "playlist").length, 1);
  assert.equal(calls.filter((call) => call[0] === "like").length, 0);
  assert.equal(nativeClicks, 0);
  heart.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.filter((call) => call[0] === "like").length, 1);
  assert.equal(heart.getAttribute("aria-pressed"), "true");
  runtime.configure({ enabled: false });
  assert.equal(original.hasAttribute("data-ppp-hidden"), false);
  assert.equal(doc.querySelectorAll(".ppp-button").length, 0);
  runtime.dispose();
  dom.window.close();
});

test("curation marker finds generic track buttons while album controls remain native", () => {
  const dom = new JSDOM('<div><button aria-checked="false"></button></div>');
  const button = dom.window.document.querySelector("button");
  button.__reactFiber$current = {
    memoizedProps: { "": "add-button" },
    return: {
      memoizedProps: { uri: "spotify:album:album" },
      return: { memoizedProps: { uri: song } },
    },
  };
  assert.equal(isSaveButton(button), true);
  assert.equal(trackFor(button, {}), null);
  dom.window.close();
});

function stateFixture(html, path = "/") {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  global.MutationObserver = dom.window.MutationObserver;
  const data = platform();
  let navigate;
  data.api.History = {
    location: { pathname: path },
    listen(callback) {
      navigate = callback;
      return () => {
        navigate = null;
      };
    },
    push(pathname) {
      this.location.pathname = pathname;
      navigate?.();
    },
  };
  const S = {
    Platform: data.api,
    Player: {
      data: { item: { uri: song } },
      addEventListener() {},
      removeEventListener() {},
    },
    Menu: {
      Item: class {
        register() {}
        deregister() {}
      },
    },
    PopupModal: { display() {}, hide() {} },
    showNotification() {},
  };
  return { ...data, dom, S };
}

test("playlist membership controls checks independently of likes and hides only destination rows", async () => {
  const fixture = stateFixture(
    `<main><div role="row" data-uri="${song}"><button class="main-addButton-button"></button></div></main><aside><div role="row" data-uri="${song}"><button class="main-addButton-button"></button></div></aside><div data-testid="now-playing-widget"><button class="main-addButton-button"></button></div>`,
    "/playlist/first",
  );
  const { dom, S, tracks, api } = fixture;
  tracks.add(`${playlist}:${song}`);
  const runtime = start(S, dom.window.document);
  await runtime.refreshStatus(true);
  const rowPlus = dom.window.document.querySelector("main .ppp-button");
  const playerPlus = dom.window.document.querySelector(
    '[data-testid="now-playing-widget"] .ppp-button',
  );
  assert.equal(rowPlus.hidden, true);
  assert.equal(rowPlus.dataset.pppIcon, "check");
  assert.equal(rowPlus.getAttribute("aria-pressed"), "true");
  assert.equal(rowPlus.nextElementSibling.hidden, false);
  assert.equal(
    rowPlus.nextElementSibling.getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(playerPlus.hidden, false);
  assert.equal(
    dom.window.document.querySelector("aside .ppp-button").hidden,
    false,
  );
  api.History.push("/playlist/other");
  assert.equal(rowPlus.hidden, false);
  api.History.push("/playlist/first");
  runtime.configure({ separateHeart: false });
  await runtime.refreshStatus(true);
  assert.equal(
    dom.window.document.querySelector("main .ppp-controls").hidden,
    true,
  );
  runtime.dispose();
  dom.window.close();
});

test("edits, likes and pin changes refresh status and subscriptions are cleaned up", async () => {
  const { dom, S, tracks, api, playlistEvents, libraryEvents } = stateFixture(
    '<div data-testid="now-playing-widget"><button class="main-addButton-button"></button></div>',
  );
  tracks.add(`${playlist}:${song}`);
  const runtime = start(S, dom.window.document);
  await runtime.refreshStatus(true);
  const [plus, heart] = dom.window.document.querySelectorAll(".ppp-button");
  assert.equal(plus.dataset.pppIcon, "check");
  tracks.delete(`${playlist}:${song}`);
  playlistEvents.emit("update", { uri: playlist });
  await settle();
  assert.equal(plus.dataset.pppIcon, "plus");
  plus.click();
  await settle();
  assert.equal(plus.dataset.pppIcon, "check");
  await api.LibraryAPI.add({ uris: [song] });
  libraryEvents.emit("update_item", { uri: song, isInLibrary: true });
  assert.equal(heart.dataset.pppIcon, "heartFilled");
  api.LibraryAPI.getContents = async () => ({
    items: [{ uri: "spotify:playlist:newPin", name: "New", pinned: true }],
  });
  libraryEvents.emit("update_pin", {
    uri: "spotify:playlist:newPin",
    isPinned: true,
  });
  await settle();
  assert.equal(plus.dataset.pppIcon, "plus");
  assert.equal(heart.dataset.pppIcon, "heartFilled");
  runtime.dispose();
  assert.equal(playlistEvents.size(), 0);
  assert.equal(libraryEvents.size(), 0);
  dom.window.close();
});

test("slow membership responses cannot overwrite a newer saved state", async () => {
  const { dom, S, api } = stateFixture(
    '<div data-testid="now-playing-widget"><button class="main-addButton-button"></button></div>',
  );
  let release;
  let reads = 0;
  api.PlaylistAPI.getItem = () =>
    ++reads === 1
      ? new Promise((resolve) => {
          release = resolve;
        })
      : Promise.resolve({ uri: song });
  const runtime = start(S, dom.window.document);
  await settle();
  assert.equal(typeof release, "function");
  await runtime.refreshStatus(true);
  release(null);
  await settle();
  assert.equal(
    dom.window.document.querySelector(".ppp-button").dataset.pppIcon,
    "check",
  );
  runtime.dispose();
  dom.window.close();
});

test("tooltips use the Spicetify renderer, stay synchronized and are destroyed with controls", async () => {
  const { dom, S, tracks } = stateFixture(
    '<div data-testid="now-playing-widget"><button class="main-addButton-button"></button></div>',
  );
  const instances = [];
  S.TippyProps = {
    delay: [200, 0],
    render() {
      const popper = dom.window.document.createElement("div");
      popper.append(dom.window.document.createElement("div"));
      return { popper };
    },
  };
  S.Tippy = (button, options) => {
    const instance = {
      content: "",
      destroyed: false,
      setContent(text) {
        this.content = text;
      },
      destroy() {
        this.destroyed = true;
      },
    };
    instance.popper = options.render(instance).popper;
    button._tippy = instance;
    instances.push(instance);
  };
  const runtime = start(S, dom.window.document);
  await runtime.refreshStatus();
  const group = dom.window.document.querySelector(".ppp-controls");
  assert.equal(group.children.length, 2);
  assert.equal(group.querySelector("button").title, "");
  assert.equal(instances[0].content, "Add to first pinned playlist");
  assert.ok(
    instances[0].popper.firstElementChild.classList.contains("ppp-tooltip"),
  );
  tracks.add(`${playlist}:${song}`);
  await runtime.refreshStatus(true);
  assert.equal(instances[0].content, "Remove from first pinned playlist");
  runtime.dispose();
  assert.ok(instances.every((instance) => instance.destroyed));
  dom.window.close();
});

test("LibraryAPI.contains emitting update_item does not cancel playlist status reads", async () => {
  const { dom, S, api, tracks, libraryEvents } = stateFixture(
    '<div data-testid="now-playing-widget"><button class="main-addButton-button"></button></div>',
  );
  tracks.add(`${playlist}:${song}`);
  api.LibraryAPI.contains = async (...uris) => {
    for (const uri of uris)
      libraryEvents.emit("update_item", { uri, isInLibrary: false });
    return uris.map(() => false);
  };
  const runtime = start(S, dom.window.document);
  await runtime.refreshStatus(true);
  assert.equal(
    dom.window.document.querySelector(".ppp-button").dataset.pppIcon,
    "check",
  );
  runtime.dispose();
  dom.window.close();
});

test("remove and readd render confirmed membership despite delayed Spotify status reads", async () => {
  const { dom, S, api, tracks } = stateFixture(
    '<div data-testid="now-playing-widget"><button class="main-addButton-button"></button></div>',
  );
  tracks.add(`${playlist}:${song}`);
  const getItem = api.PlaylistAPI.getItem;
  let actionRead = false;
  let stalePresent = true;
  api.PlaylistAPI.getItem = async (...args) => {
    if (actionRead) {
      actionRead = false;
      return getItem(...args);
    }
    return stalePresent ? { uri: song, uid: `row-${song}` } : null;
  };
  const runtime = start(S, dom.window.document);
  const now = Date.now;
  try {
    await runtime.refreshStatus(true);
    const button = dom.window.document.querySelector(".ppp-button");
    assert.equal(button.dataset.pppIcon, "check");
    actionRead = true;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tracks.has(`${playlist}:${song}`), false);
    assert.equal(button.dataset.pppIcon, "plus");
    assert.equal(button.getAttribute("aria-pressed"), "false");
    await runtime.refreshStatus(true);
    assert.equal(button.dataset.pppIcon, "plus");
    stalePresent = false;
    actionRead = true;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tracks.has(`${playlist}:${song}`), true);
    assert.equal(button.dataset.pppIcon, "check");
    assert.equal(
      button.getAttribute("aria-label"),
      "Remove from first pinned playlist",
    );
    await runtime.refreshStatus(true);
    assert.equal(button.dataset.pppIcon, "check");
    // After the short consistency window, external edits must still refresh.
    Date.now = () => now() + 6000;
    await runtime.refreshStatus(true);
    assert.equal(button.dataset.pppIcon, "plus");
  } finally {
    Date.now = now;
    runtime.dispose();
    dom.window.close();
  }
});
