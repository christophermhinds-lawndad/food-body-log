import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");
const installStatusSource = await readFile(new URL("../public/scripts/install-status.js", import.meta.url), "utf8");

test("settings copy includes required local-only, update, storage, and cache status text", () => {
  const requiredSnippets = [
    "Your data stays on this device. Food, body, and journal data are not synced to an account.",
    "Offline app shell is ready on this device.",
    "Checking offline app shell...",
    "Open this app while online once more, then check again.",
    "Updates may require revisiting the app URL after new static files are published.",
    "Deleting the Home Screen app, clearing website data, or changing browser storage can remove local app data from this device. Export a backup when you want a copy outside browser storage.",
  ];

  for (const snippet of requiredSnippets) {
    assert.match(
      `${html}\n${appSource}\n${installStatusSource}`,
      new RegExp(escapeRegExp(snippet)),
      `missing copy: ${snippet}`,
    );
  }
});

test("settings backup copy exposes export import warnings and confirmation language", () => {
  const requiredSnippets = [
    "Data backup",
    "Backups are JSON files you control. They include saved meals, weight entries, reflections, breakthroughs, and portable app settings from this device.",
    "Export backup",
    "Preparing backup...",
    "Backup exported. Keep the file somewhere you can find it later.",
    "Backup could not be exported. Reopen the app and try again. Data already saved on this device stays local.",
    "Import backup",
    "Choose backup file",
    "Import replaces local data on this device after confirmation. Export first if you want to keep a copy of the current local data.",
    "No backup selected",
    "Backup selected:",
    "Checking backup...",
    "Backup looks ready to import. Review the confirmation before replacing local data.",
    "Choose a backup first",
    "Replace local data?",
    "This will replace the local data currently saved on this device with the selected backup. Export a backup first if you want a copy of what is here now.",
    "Replace local data",
    "Backup imported. Reopen each tab to see restored local data.",
    "Backup could not be read. Choose a Food Body Log JSON backup exported from this app.",
    "This backup format is not supported by this version of Food Body Log.",
    "This backup is missing required local data sections, so nothing was imported.",
    "This file is larger than this version can import. Choose a smaller Food Body Log backup.",
    "Nothing was imported, and the local data already on this device was not changed.",
  ];

  for (const snippet of requiredSnippets) {
    assert.match(
      `${html}\n${appSource}\n${installStatusSource}`,
      new RegExp(escapeRegExp(snippet)),
      `missing backup copy: ${snippet}`,
    );
  }
});

test("settings markup exposes native backup controls and polite status regions", () => {
  assert.match(html, /<section[^>]+class="backup-section"[^>]+aria-labelledby="data-backup-title"/);
  assert.match(html, /<h2[^>]+id="data-backup-title"[^>]*>Data backup<\/h2>/);
  assert.match(html, /<p[^>]+class="backup-warning"[^>]*>/);
  assert.match(html, /<button[^>]+id="export-backup"[^>]+class="primary-action compact-action"[^>]+type="button"[^>]*>Export backup<\/button>/);
  assert.match(html, /id="export-backup-status" class="status-message backup-status" aria-live="polite"/);
  assert.match(html, /<section[^>]+class="backup-file-control"[^>]+aria-labelledby="import-backup-title"/);
  assert.match(html, /<h3[^>]+id="import-backup-title"[^>]*>Import backup<\/h3>/);
  assert.match(html, /<label[^>]+class="field-label"[^>]+for="backup-file-input"[^>]*>Choose backup file<\/label>/);
  assert.match(html, /<input[^>]+id="backup-file-input"[^>]+type="file"[^>]+accept="\.json,application\/json"/);
  assert.match(html, /id="backup-selected-file" class="status-message backup-selected-file" aria-live="polite"/);
  assert.match(html, /id="import-backup-status" class="status-message backup-status" aria-live="polite"/);
  assert.match(html, /<button[^>]+id="replace-local-data"[^>]+class="secondary-action"[^>]+type="button"[^>]+disabled[^>]*>Choose a backup first<\/button>/);
});

test("settings markup exposes separate install, offline, storage, privacy, caveat, and update rows", () => {
  const requiredLabels = [
    "Install mode",
    "Offline app shell",
    "Local storage",
    "Local-only privacy",
    "Storage caveat",
    "Updates",
  ];

  for (const label of requiredLabels) {
    assert.match(html, new RegExp(`<dt>${escapeRegExp(label)}</dt>`), `missing settings row: ${label}`);
  }
});

test("safe DOM helper writes textContent and exposes no raw HTML insertion API", async () => {
  const domSource = await readFile(new URL("../public/scripts/dom.js", import.meta.url), "utf8");
  const dom = await import("../public/scripts/dom.js");
  const node = { textContent: "", dataset: {} };

  assert.equal(typeof dom.setText, "function");
  assert.equal(typeof dom.setStatusText, "function");

  dom.setText(node, "<img src=x onerror=alert(1)>Ready");
  assert.equal(node.textContent, "<img src=x onerror=alert(1)>Ready");

  assert.match(domSource, /\.textContent\s*=/);
  assert.doesNotMatch(domSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(domSource, /insertAdjacentHTML|outerHTML|createContextualFragment/);
  assert.equal("setHtml" in dom, false);
  assert.equal("renderHtml" in dom, false);
});

test("backup controller imports portability helpers and queries settings controls once", () => {
  assert.match(
    appSource,
    /import \{ createDownloadSpec, exportLocalData, parseBackupText, replaceLocalDataFromBackup \} from "\.\/data-portability\.js\?v=2";/,
  );

  for (const selector of [
    "#export-backup",
    "#export-backup-status",
    "#backup-file-input",
    "#backup-selected-file",
    "#replace-local-data",
    "#import-backup-status",
  ]) {
    assert.match(appSource, new RegExp(`document\\.querySelector\\("${escapeRegExp(selector)}"\\)`), `missing query for ${selector}`);
  }
});

test("backup controller uses safe text sinks for every filename and status message", () => {
  for (const nodeName of [
    "exportBackupStatus",
    "backupSelectedFile",
    "importBackupStatus",
    "replaceBackupButton",
  ]) {
    assert.match(appSource, new RegExp(`setText\\(${nodeName},`), `missing setText use for ${nodeName}`);
  }

  assert.doesNotMatch(appSource, /exportBackupStatus\.textContent|backupSelectedFile\.textContent|importBackupStatus\.textContent|replaceBackupButton\.textContent/);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=|insertAdjacentHTML|outerHTML|createContextualFragment/);
});

test("backup import controller validates before replace and guards stale file selections", () => {
  assert.match(appSource, /let backupSelectionRequestID = 0;/);
  assert.match(appSource, /let readyBackupPayload = null;/);
  assert.match(appSource, /backupSelectionRequestID \+= 1;/);
  assert.match(appSource, /const requestID = backupSelectionRequestID;/);
  assert.match(appSource, /if \(requestID !== backupSelectionRequestID\) \{/);
  assert.match(appSource, /parseBackupText\(text\)/);
  assert.match(appSource, /readyBackupPayload = parsed\.payload;/);
  assert.match(appSource, /replaceBackupButton\.disabled = !readyBackupPayload;/);
});

test("backup replace action is confirmation gated and invalid paths do not call writer", () => {
  assert.match(appSource, /window\.confirm\(`\$\{BACKUP_UI_COPY\.confirmTitle\}\\n\\n\$\{BACKUP_UI_COPY\.confirmBody\}`\)/);
  assert.match(appSource, /replaceLocalDataFromBackup\(readyBackupPayload\)/);
  assert.match(appSource, /Nothing was imported, and the local data already on this device was not changed\./);

  const validationHandler = appSource.match(/async function validateSelectedBackup\(\)[\s\S]*?\n}\n\n/)?.[0] || "";
  assert.match(validationHandler, /parseBackupText\(text\)/);
  assert.doesNotMatch(validationHandler, /replaceLocalDataFromBackup/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
