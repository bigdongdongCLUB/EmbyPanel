import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/media-title.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const output = {};
new Function("exports", compiled)(output);
const { compactMediaTitle } = output;

test("23 CJK characters fit; longer names get three dots", () => {
  assert.equal(compactMediaTitle("中".repeat(23)), "中".repeat(23));
  assert.equal(compactMediaTitle("中".repeat(24)), "中".repeat(23) + "...");
  assert.equal(compactMediaTitle("あ".repeat(50)), "あ".repeat(23) + "...");
});

test("narrow characters use half the width and original titles remain intact", () => {
  const original = "a".repeat(47);
  assert.equal(compactMediaTitle(original), "a".repeat(46) + "...");
  assert.equal(original.length, 47);
  assert.equal(compactMediaTitle("中".repeat(22) + "ab"), "中".repeat(22) + "ab");
  assert.equal(compactMediaTitle("中".repeat(22) + "abc"), "中".repeat(22) + "ab...");
  assert.equal(compactMediaTitle(""), "");
});

test("truncation never splits emoji or combining sequences", () => {
  assert.equal(compactMediaTitle("👨‍👩‍👧‍👦".repeat(24)), "👨‍👩‍👧‍👦".repeat(23) + "...");
  assert.equal(compactMediaTitle("e\u0301".repeat(47)), "e\u0301".repeat(46) + "...");
});
