const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { before, test } = require("node:test");

const root = path.resolve(__dirname, "..");
const baseManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

before(() => {
  // Also verify that the builder resolves paths independently of the caller's cwd.
  execFileSync(process.execPath, [path.join(root, "scripts/build.mjs")], { cwd: os.tmpdir() });
});

for (const browser of ["chrome", "firefox"]) {
  const directory = path.join(root, "dist", browser);

  test(`${browser} package preserves shared extension behavior and permissions`, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    for (const [key, value] of Object.entries(baseManifest)) {
      if (key !== "background") assert.deepEqual(manifest[key], value, key);
    }
    for (const file of ["main.js", "background.js", "style.css"]) {
      assert.deepEqual(fs.readFileSync(path.join(directory, file)), fs.readFileSync(path.join(root, file)));
    }
    for (const icon of Object.values(manifest.icons)) {
      assert.deepEqual(fs.readFileSync(path.join(directory, icon)), fs.readFileSync(path.join(root, icon)));
    }
    assert.deepEqual(fs.readdirSync(directory).sort(),
      ["background.js", "images", "main.js", "manifest.json", "style.css"]);
    if (browser === "chrome") {
      assert.deepEqual(manifest.background, { service_worker: "background.js" });
      assert.equal(manifest.browser_specific_settings, undefined);
    } else {
      assert.deepEqual(manifest.background, { scripts: ["background.js"] });
      assert.equal(Object.hasOwn(manifest.background, "persistent"), false,
        "Firefox MV3 must omit the unsupported persistent property");
      assert.equal(manifest.browser_specific_settings.gecko.id, "vintedfavfilteraddonpublic@tobiasfrck");
      assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions,
        { required: ["none"] }, "Declare local-only processing for Firefox's data consent system");
    }
  });

  test(`${browser} background sends toolbar clicks to the existing content script`, () => {
    let listener;
    const messages = [];
    const api = {
      action: { onClicked: { addListener(callback) { listener = callback; } } },
      tabs: { sendMessage(tabId, message) { messages.push({ tabId, message }); } },
    };
    // No DOM globals: the Chrome background must also work inside a service worker.
    vm.runInNewContext(fs.readFileSync(path.join(directory, "background.js"), "utf8"), {
      [browser === "firefox" ? "browser" : "chrome"]: api,
      console: { log() {} },
    });
    assert.equal(typeof listener, "function");
    listener({ id: 42, url: "https://www.vinted.de/member/items/favourite_list" });
    assert.deepEqual(JSON.parse(JSON.stringify(messages)),
      [{ tabId: 42, message: { message: "actionButtonClicked" } }]);
    listener({ id: 43, url: "about:blank" });
    listener({ id: 44 });
    assert.equal(messages.length, 1);
  });
}
