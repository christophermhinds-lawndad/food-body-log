import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);
const readmePath = new URL("../README.md", import.meta.url);
const staticHostingDocPath = new URL("../docs/static-hosting.md", import.meta.url);
const iphoneUatDocPath = new URL("../docs/iphone-uat.md", import.meta.url);

const requiredPublishFiles = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "styles/app.css",
  "scripts/app.js",
  "scripts/plan-suggestions-ui.js",
  "scripts/paths.js",
  "scripts/storage.js",
  "scripts/day-policy.js",
  "scripts/tracking-model.js",
  "scripts/today-tracking.js",
  "scripts/journal-model.js",
  "scripts/journal-tracking.js",
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

test("README documents public publish directory and local static server command", async () => {
  const readme = await readFile(readmePath, "utf8");

  assert.match(readme, /`public\/` is the publish directory/);
  assert.match(readme, /python3 -m http\.server 4173 --directory public/);
});

test("static hosting docs cover static-only root and project-subpath deployment", async () => {
  const doc = await readFile(staticHostingDocPath, "utf8");
  const normalized = normalizeDoc(doc);

  const requiredSnippets = [
    "root domain",
    "project subpath",
    "https install url",
    "no build command",
    "no server functions",
    "no secrets",
    "no app-user accounts",
    "no database service",
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(normalized.includes(snippet), `missing static hosting coverage: ${snippet}`);
  }
});

test("static hosting docs do not instruct package installs or backend setup", async () => {
  const docs = [
    await readFile(readmePath, "utf8"),
    await readFile(staticHostingDocPath, "utf8"),
  ].join("\n");

  assert.doesNotMatch(docs, /\b(npm|pnpm|yarn|pip|brew|cargo)\s+(install|add)\b/i);
  assert.doesNotMatch(docs, /\b(create|configure|set up|setup)\s+(a\s+)?(backend|api server|database|server function|cloud function)\b/i);
  assert.doesNotMatch(
    docs,
    /\b(create|configure|set|add|enter|provide)\s+(a\s+)?(secret|environment variable|env var|analytics project|native ios project|xcode build|app store submission|apple developer program)\b/i,
  );
});

function normalizeDoc(value) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

test("iPhone UAT checklist covers install, offline, status, and update validation", async () => {
  const doc = await readFile(iphoneUatDocPath, "utf8");
  const normalized = normalizeDoc(doc);

  const requiredSnippets = [
    "iphone 13 safari",
    "hosted https url",
    "add to home screen",
    "standalone relaunch",
    "cache-ready settings status",
    "airplane-mode launch",
    "update/relaunch data preservation",
    "indexeddb setup/status record",
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(normalized.includes(snippet), `missing iPhone UAT coverage: ${snippet}`);
  }
});

test("iPhone UAT checklist records blocked status for missing device or hosted URL", async () => {
  const doc = await readFile(iphoneUatDocPath, "utf8");
  const normalized = normalizeDoc(doc);

  assert.ok(normalized.includes("blocked"), "checklist must include a blocked result");
  assert.ok(normalized.includes("no physical iphone 13 available"), "checklist must name missing device blocker");
  assert.ok(normalized.includes("no hosted https static-host url available"), "checklist must name missing URL blocker");
});

test("iPhone UAT checklist avoids forbidden diet, shame, and scoring language", async () => {
  const doc = await readFile(iphoneUatDocPath, "utf8");

  assert.doesNotMatch(doc, /\b(diet|weight-loss|streak|score|scoring|calorie|macro|food grade|goal weight|shame|failure|advice)\b/i);
});
