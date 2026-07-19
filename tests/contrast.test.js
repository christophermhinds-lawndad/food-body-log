import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../public/styles/app.css", import.meta.url), "utf8");
const tokens = parseRootTokens(css);

test("core color tokens stay on the Phase 6 palette", () => {
  assert.equal(tokens.background, "#FAFAF8");
  assert.equal(tokens.surface, "#FFFFFF");
  assert.equal(tokens["surface-secondary"], "#E8F0ED");
  assert.equal(tokens.accent, "#256D69");
  assert.equal(tokens.text, "#1F2933");
  assert.equal(tokens["text-secondary"], "#596670");
  assert.equal(tokens.border, "#D8DED8");
  assert.equal(tokens.destructive, "#8F3F36");
});

test("text controls statuses and stable notice meet contrast thresholds", () => {
  assertContrast(tokens.text, tokens.background, 4.5, "body text on app background");
  assertContrast(tokens.text, tokens.surface, 4.5, "body text on surface");
  assertContrast(tokens["text-secondary"], tokens.background, 4.5, "secondary text on background");
  assertContrast(tokens["text-secondary"], tokens.surface, 4.5, "secondary text on surface");
  assertContrast("#FFFFFF", tokens.accent, 4.5, "primary button text");
  assertContrast(tokens.text, tokens.surface, 4.5, "secondary button text");
  assertContrast(tokens.destructive, tokens.surface, 4.5, "destructive action text");
  assertContrast(tokens.accent, tokens["surface-secondary"], 3, "selected status accent");
  assertContrast("#7C5CA8", "#F2ECFA", 3, "stable notice border on stable background");
});

test("focus outlines use the accent color with 4px offset", () => {
  const focusBlock = css.match(/\.primary-action:focus-visible[\s\S]*?\.tab-button:focus-visible\s*\{[\s\S]*?\}/)?.[0] || "";

  assert.match(focusBlock, /outline: 3px solid var\(--accent\);/);
  assert.match(focusBlock, /outline-offset: 4px;/);
  assertContrast(tokens.accent, tokens.background, 3, "accent focus outline on background");
  assertContrast(tokens.accent, tokens.surface, 3, "accent focus outline on surface");
});

test("stable weight notice keeps accepted D-07 colors exactly", () => {
  assert.match(css, /\.weight-summary-notice\.is-stable\s*\{[\s\S]*border-color: #7C5CA8;[\s\S]*background: #F2ECFA;[\s\S]*\}/);
});

function parseRootTokens(source) {
  const rootBlock = source.match(/:root\s*\{[\s\S]*?\}/)?.[0] || "";
  const entries = [...rootBlock.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)]
    .map((match) => [match[1], match[2].toUpperCase()]);

  return Object.fromEntries(entries);
}

function assertContrast(foreground, background, minimum, label) {
  const ratio = contrastRatio(foreground, background);
  assert.ok(ratio >= minimum, `${label} contrast ${ratio.toFixed(2)} must be at least ${minimum}`);
}

function contrastRatio(left, right) {
  const leftLum = relativeLuminance(hexToRgb(left));
  const rightLum = relativeLuminance(hexToRgb(right));
  const lighter = Math.max(leftLum, rightLum);
  const darker = Math.min(leftLum, rightLum);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function hexToRgb(value) {
  const match = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(value);
  assert.ok(match, `invalid hex color: ${value}`);

  return match.slice(1).map((channel) => Number.parseInt(channel, 16));
}
