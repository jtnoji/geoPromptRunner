/**
 * Rubric validator tests — a coherent draft passes clean, and each cross-cutting
 * invariant (I1–I5) trips to a "block" when violated; quality issues surface as
 * "warn". These are the assertions that turn each past credibility bug into a
 * permanent guard.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDraft } from "../src/rubric/validate.ts";
import { headline } from "../src/render/copy.ts";
import type { Finding, TeaserDraft } from "../src/types/domain.ts";
import type { AnswerRecord, ReportPayload } from "../src/types/platform.ts";

function report(over: Partial<ReportPayload> = {}): ReportPayload {
  return {
    client_name: "Fort",
    run_date: "2026-06-20",
    query_set_version: "t",
    runs_per_query: 1,
    engines: ["perplexity", "openai", "gemini"],
    competitors: ["Whoop", "Oura"],
    client_domains: ["fort.cx"],
    detection: "judge",
    scorecard: {
      visibility_grade: null,
      share_of_model_client: 0,
      top_competitor: "Whoop",
      top_competitor_share: 1,
      mention_rate_client: 0,
      mention_rate_top_competitor: 1,
      citation_rate_client: 0,
      accuracy_assessed: false,
      accuracy_flag_count: null,
    },
    leaderboard: [],
    by_bucket: [],
    accuracy_flags: [],
    sources: [],
    losing_queries: [],
    ...over,
  };
}

function answers(): AnswerRecord[] {
  const mk = (
    query_id: string,
    engine_name: string,
    prompt: string,
    response: string,
  ): AnswerRecord => ({
    query_id,
    intent: "category",
    prompt,
    engine_name,
    run_index: 0,
    response,
    citations: [],
    timestamp: "t",
  });
  return [
    mk("q1", "perplexity", "best recovery wearable?", "Whoop leads."),
    mk("q2", "openai", "what are the best alternatives to Oura?", "Whoop is the top alternative."),
    mk("q3", "gemini", "is Fort any good?", "Fort is decent, honestly."),
  ];
}

function leadFinding(): Finding {
  return {
    role: "lead",
    source: "losing_query",
    queryId: "q1",
    intent: "category",
    engineName: "perplexity",
    competitor: "Whoop",
    verbatimQuery: "best recovery wearable?",
    verbatimAnswer: "Whoop leads.",
    citations: ["https://reddit.com/x"],
    rankScore: 50,
  };
}

function tableFinding(): Finding {
  return {
    role: "table",
    source: "losing_query",
    queryId: "q2",
    intent: "comparison",
    engineName: "openai",
    competitor: "Whoop",
    verbatimQuery: "what are the best alternatives to Oura?",
    verbatimAnswer: "Whoop is the top alternative.",
    citations: [],
    rankScore: 55,
  };
}

/** A coherent draft that satisfies every invariant (no violations at all). */
function validDraft(): TeaserDraft {
  return {
    prospectUrl: "https://fort.cx",
    companyName: "Fort",
    category: "recovery wearable",
    runDate: "2026-06-20",
    heroEngine: "perplexity",
    heroCompetitor: "Whoop",
    headline: headline("Fort", "Whoop"),
    leadSentence: "…",
    headlineNumber: {
      companyAppears: 1,
      competitorAppears: 2,
      competitorName: "Whoop",
      n: 3,
      lostRecommendations: 2,
      enginesCovered: 3,
    },
    stakesLine: "…",
    cta: "…",
    lead: leadFinding(),
    table: [tableFinding()],
    report: report(),
    answers: answers(),
    status: "draft",
  };
}

const blocks = (d: TeaserDraft) => validateDraft(d).filter((v) => v.severity === "block");
const rules = (d: TeaserDraft) => new Set(validateDraft(d).map((v) => v.rule));

test("a coherent draft passes with zero violations", () => {
  assert.deepEqual(validateDraft(validDraft()), []);
});

test("I5: a regex-detection report is blocked", () => {
  const d = validDraft();
  d.report = report({ detection: "regex" });
  assert.ok(rules(d).has("I5"));
  assert.ok(blocks(d).length >= 1);
});

test("I1: the lead naming a different rival than the hero is blocked", () => {
  const d = validDraft();
  d.lead = { ...leadFinding(), competitor: "Oura" };
  assert.ok(blocks(d).some((v) => v.rule === "I1"));
});

test("I1: a headline number naming a different rival than the hero is blocked", () => {
  const d = validDraft();
  d.headlineNumber = { ...d.headlineNumber, competitorName: "Oura" };
  assert.ok(blocks(d).some((v) => v.rule === "I1"));
});

test("I1: a headline that doesn't name the hero rival is blocked", () => {
  const d = validDraft();
  d.headline = "AI is sending your buyers to Oura — not Fort.";
  assert.ok(blocks(d).some((v) => v.rule === "I1"));
});

test("I3: a printed closed head-to-head is blocked", () => {
  const d = validDraft();
  // The lead query now pits two rivals against each other, client absent.
  d.lead = { ...leadFinding(), verbatimQuery: "is Whoop or Oura better for recovery?" };
  assert.ok(blocks(d).some((v) => v.rule === "I3"));
});

test("I2: overstating the client's appearances (more than the answers support) is blocked", () => {
  const d = validDraft();
  // Fort is named in only 1 answered query, but the headline claims 3.
  d.headlineNumber = { ...d.headlineNumber, companyAppears: 3 };
  const bs = blocks(d);
  assert.ok(bs.some((v) => v.rule === "I2"));
});

test("I2: overstating lost recommendations beyond the client-absent cells is blocked", () => {
  const d = validDraft();
  d.headlineNumber = { ...d.headlineNumber, lostRecommendations: 99 };
  assert.ok(blocks(d).some((v) => v.rule === "I2"));
});

test("I2: a printed finding that joins to no cached answer is blocked", () => {
  const d = validDraft();
  d.lead = { ...leadFinding(), queryId: "does-not-exist" };
  assert.ok(blocks(d).some((v) => v.rule === "I2"));
});

test("I2: an impossible headline number (companyAppears > n) is blocked", () => {
  const d = validDraft();
  d.headlineNumber = { ...d.headlineNumber, companyAppears: 9, n: 3 };
  assert.ok(blocks(d).some((v) => v.rule === "I2"));
});

test("I4: multi-engine data but single-engine printed findings warns (does not block)", () => {
  const d = validDraft();
  // Move the table row onto the lead's engine, and give it a perplexity answer to
  // join to — so the only difference is that both printed rows share one engine.
  d.table = [{ ...tableFinding(), engineName: "perplexity" }];
  d.answers = [
    ...answers(),
    {
      query_id: "q2",
      intent: "comparison",
      prompt: "what are the best alternatives to Oura?",
      engine_name: "perplexity",
      run_index: 0,
      response: "Whoop is the top alternative.",
      citations: [],
      timestamp: "t",
    },
  ];
  const vs = validateDraft(d);
  assert.ok(vs.some((v) => v.rule === "I4" && v.severity === "warn"));
  assert.equal(vs.filter((v) => v.severity === "block").length, 0, "I4 never blocks");
});

test("Q: an empty pattern table warns (does not block)", () => {
  const d = validDraft();
  d.table = [];
  const vs = validateDraft(d);
  assert.ok(vs.some((v) => v.rule === "Q-thin-table" && v.severity === "warn"));
  assert.equal(vs.filter((v) => v.severity === "block").length, 0);
});

test("a non-hero rival in the table warns but does not block (backfill is allowed)", () => {
  const d = validDraft();
  d.table = [{ ...tableFinding(), competitor: "Oura" }];
  const vs = validateDraft(d);
  assert.ok(vs.some((v) => v.rule === "I1-table" && v.severity === "warn"));
  assert.equal(vs.filter((v) => v.severity === "block").length, 0);
});
