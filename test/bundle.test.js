const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");

test("the installable browser bundle waits for Spicetify, starts once and restores the native control", () => {
  const dom = new JSDOM(
    '<div role="row" data-uri="spotify:track:abc"><button class="main-addButton-button">+</button></div>',
    { runScripts: "outside-only" },
  );
  const source = readFileSync("pinned-playlist-plus.js", "utf8");
  const retries = [];
  dom.window.setTimeout = (callback) => {
    retries.push(callback);
    return 1;
  };
  dom.window.eval(source);
  assert.equal(dom.window.PinnedPlaylistPlus, undefined);
  assert.equal(retries.length, 1);
  let registrations = 0;
  dom.window.Spicetify = {
    Platform: {
      LocalStorageAPI: { getItem: () => ({ mode: "liked" }), setItem() {} },
      LibraryAPI: {
        getContents: async () => ({ items: [] }),
        contains: async () => [false],
      },
      PlaylistAPI: { getItem: async () => null },
    },
    Player: { addEventListener() {}, removeEventListener() {} },
    Menu: {
      Item: class {
        register() {
          registrations++;
        }
        deregister() {}
      },
    },
    ReactJSX: { jsx() {} },
    PopupModal: { display() {}, hide() {} },
    showNotification() {},
  };
  retries.shift()();
  const runtime = dom.window.PinnedPlaylistPlus;
  assert.ok(runtime);
  assert.equal(dom.window.document.querySelectorAll(".ppp-controls").length, 1);
  dom.window.eval(source);
  assert.equal(registrations, 1);
  assert.equal(dom.window.PinnedPlaylistPlus, runtime);
  runtime.configure({ enabled: false });
  assert.equal(dom.window.document.querySelectorAll(".ppp-controls").length, 0);
  assert.equal(
    dom.window.document.querySelector("button").hasAttribute("data-ppp-hidden"),
    false,
  );
  runtime.dispose();
  dom.window.close();
});
