/**
 * The shared entity matcher (used by generation, selection, and validation).
 * Regression for adversarial finding #1: an ASCII `\b` matcher failed on rival
 * names bordered by punctuation ("C#", "C++") or containing non-ASCII letters
 * ("Nestlé"), letting a rigged head-to-head slip past detection — while still
 * false-matching a name embedded in a larger word.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatcher } from "../src/select/entity.ts";

test("matches a punctuation-bearing name bordered by non-word chars", () => {
  const m = buildMatcher("C#");
  assert.ok(m("Is C# or Go the better first language?"), "C# is detected");
  assert.ok(buildMatcher("C++")("C++ vs Rust for systems work?"), "C++ is detected");
});

test("matches an accented / non-ASCII name", () => {
  assert.ok(buildMatcher("Nestlé")("Does Nestlé own that brand?"), "accented name detected");
});

test("does NOT match a name embedded inside a larger word", () => {
  assert.ok(!buildMatcher("Cal")("Calendly is a scheduling tool."), "'Cal' not matched inside 'Calendly'");
  assert.ok(!buildMatcher("Fort")("Comfort is the priority."), "'Fort' not matched inside 'Comfort'");
  assert.ok(!buildMatcher("Oura")("Ouraboros is the client."), "'Oura' not matched inside 'Ouraboros'");
});

test("is case-insensitive and alias-aware", () => {
  const m = buildMatcher("You Need A Budget", ["YNAB"]);
  assert.ok(m("i love ynab for envelopes"), "alias matches, case-insensitive");
  assert.ok(m("You Need A Budget is great"), "full name matches");
});
