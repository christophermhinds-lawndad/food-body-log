import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);

const requiredPublishFiles = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "styles/app.css",
  "scripts/app.js",
  "scripts/paths.js",
  "scripts/storage.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

const forbiddenRootArtifacts = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".env",
  ".env.local",
  "server.js",
  "netlify/functions",
  "api",
];

async function pathExists(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

test("publish directory contains the complete static app shell file set", async () => {
  for (const relativePath of requiredPublishFiles) {
    const file = new URL(relativePath, publicRoot);
    assert.equal(await pathExists(file), true, `missing ${relativePath}`);
  }
});

test("icon files are local non-empty PNG assets", async () => {
  const iconPaths = [
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
  ];

  for (const relativePath of iconPaths) {
    const file = new URL(relativePath, publicRoot);
    const bytes = await readFile(file);
    const info = await stat(file);

    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${relativePath} is not a PNG`);
    assert.ok(info.size > 100, `${relativePath} should not be empty`);
  }
});

test("index.html install metadata links are local relative assets", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");

  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /\shref="\/(?!\/)/);
  assert.doesNotMatch(html, /\ssrc="\/(?!\/)/);
});

test("static publish does not require package, env, backend, or server route artifacts", async () => {
  for (const relativePath of forbiddenRootArtifacts) {
    const exists = await pathExists(join(repoRoot.pathname, relativePath));
    assert.equal(exists, false, `${relativePath} must not be required for static publish`);
  }
});
