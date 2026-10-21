import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const baseManifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const firefoxOverrides = JSON.parse(await readFile(path.join(root, "manifests/firefox.json"), "utf8"));
const extensionFiles = ["main.js", "background.js", "style.css", "images"];

for (const browser of ["chrome", "firefox"]) {
  const destination = path.resolve(dist, browser);
  // Only clean the two generated browser directories, never the source tree.
  if (path.dirname(destination) !== dist) throw new Error("Invalid build destination");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  const manifest = browser === "firefox"
    ? { ...baseManifest, ...firefoxOverrides }
    : baseManifest;
  await writeFile(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  for (const file of extensionFiles) {
    await cp(path.join(root, file), path.join(destination, file), { recursive: true });
  }
  console.log(`Built dist/${browser} (${manifest.version})`);
}
