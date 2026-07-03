import assert from "node:assert/strict";
import { test } from "node:test";
import { selectFindings, selectWhyGaps } from "../src/select/selectFindings.ts";
import type { CompanyProfile } from "../src/types/domain.ts";
import type { AnswerRecord, ReportPayload, SiteAuditPayload } from "../src/types/platform.ts";

function profile(): CompanyProfile {
  return {
    url: "https://acme.io",
    name: "Acme",
    category: "budgeting app",
    competitors: [{ name: "YNAB", aliases: [], confirmed: true }],
    clientDomains: ["acme.io"],
    productClaims: [],
    resolvedAt: "1970-01-01T00:00:00Z",
    resolverModel: "mock",
  };
}

function baseReport(over: Partial<ReportPayload> = {}): ReportPayload {
  return {
    client_name: "Acme",
    run_date: "2026-06-20",
    query_set_version: "t",
    runs_per_query: 1,
    engines: ["perplexity", "openai"],
    competitors: ["YNAB"],
    client_domains: ["acme.io"],
    detection: "judge",
    scorecard: {
      visibility_grade: null,
      share_of_model_client: 0,
      top_competitor: "YNAB",
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
    losing_queries: [
      { query_id: "q1", intent: "category", engine_name: "openai", competitor: "YNAB" },
      { query_id: "q2", intent: "comparison", engine_name: "perplexity", competitor: "YNAB" },
    ],
    ...over,
  };
}

function answers(): AnswerRecord[] {
  return [
    {
      query_id: "q1",
      intent: "category",
      prompt: "best budgeting app?",
      engine_name: "openai",
      run_index: 0,
      response: "YNAB is the top pick.",
      citations: ["https://reddit.com/x"],
      timestamp: "t",
    },
    {
      query_id: "q2",
      intent: "comparison",
      prompt: "alternatives to YNAB?",
      engine_name: "perplexity",
      run_index: 0,
      response: "YNAB alternatives include Monarch Money.",
      citations: [],
      timestamp: "t",
    },
  ];
}

test("lead favors a demand-side loss (category) over a comparison; comparison goes to the table", () => {
  const r = selectFindings(profile(), baseReport(), answers());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // q1 is category (demand-side) -> hero lead over q2 comparison, even though q2
  // is on the more credible engine. The hero engine follows the lead, and the
  // comparison still appears in the pattern table (corroboration, not the hook).
  assert.equal(r.lead.queryId, "q1");
  assert.equal(r.lead.intent, "category");
  assert.equal(r.heroEngine, "openai");
  assert.equal(r.lead.verbatimQuery, "best budgeting app?");
  assert.ok(r.table.some((f) => f.queryId === "q2"));
});

test("table holds distinct queries, not the lead's", () => {
  const r = selectFindings(profile(), baseReport(), answers());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  for (const f of r.table) assert.notEqual(f.queryId, r.lead.queryId);
});

// The pattern table should read as cross-model: when a lower-scored losing query
// sits on an engine not yet shown, it's preferred over a higher-scored one that
// repeats an engine already in the table/lead. Here q3 (perplexity) outscores q4
// (gemini) but repeats q2's engine, so q4 is chosen to diversify.
test("table prefers a distinct engine over a higher-scored repeat", () => {
  const report = baseReport({
    engines: ["openai", "perplexity", "gemini"],
    losing_queries: [
      { query_id: "q1", intent: "category", engine_name: "openai", competitor: "YNAB" }, // lead
      { query_id: "q2", intent: "comparison", engine_name: "perplexity", competitor: "YNAB" },
      { query_id: "q3", intent: "comparison", engine_name: "perplexity", competitor: "YNAB" },
      { query_id: "q4", intent: "comparison", engine_name: "gemini", competitor: "YNAB" },
    ],
  });
  const mk = (id: string, engine: string, intent: string): AnswerRecord => ({
    query_id: id, intent: intent as AnswerRecord["intent"], prompt: `${id}?`,
    engine_name: engine, run_index: 0, response: "YNAB wins.", citations: [], timestamp: "t",
  });
  const ans = [
    mk("q1", "openai", "category"),
    mk("q2", "perplexity", "comparison"),
    mk("q3", "perplexity", "comparison"),
    mk("q4", "gemini", "comparison"),
  ];
  const r = selectFindings(profile(), report, ans);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.lead.queryId, "q1");
  assert.equal(r.table.length, 2);
  // q4 (gemini) is chosen over the higher-scored q3 (perplexity, a repeat).
  assert.ok(r.table.some((f) => f.queryId === "q4"));
  assert.ok(!r.table.some((f) => f.queryId === "q3"));
  // Lead + table span three distinct engines — the pattern is cross-model.
  const engines = new Set([r.lead.engineName, ...r.table.map((f) => f.engineName)]);
  assert.equal(engines.size, 3);
});

// When only one engine produced losing queries, the table still fills its 2 rows
// (pass 2 backfills regardless of engine) rather than leaving the table short.
test("table backfills from one engine when no distinct engine is available", () => {
  const report = baseReport({
    engines: ["perplexity"],
    losing_queries: [
      { query_id: "q1", intent: "category", engine_name: "perplexity", competitor: "YNAB" }, // lead
      { query_id: "q2", intent: "comparison", engine_name: "perplexity", competitor: "YNAB" },
      { query_id: "q3", intent: "comparison", engine_name: "perplexity", competitor: "YNAB" },
    ],
  });
  const mk = (id: string, intent: string): AnswerRecord => ({
    query_id: id, intent: intent as AnswerRecord["intent"], prompt: `${id}?`,
    engine_name: "perplexity", run_index: 0, response: "YNAB wins.", citations: [], timestamp: "t",
  });
  const r = selectFindings(profile(), report, [mk("q1", "category"), mk("q2", "comparison"), mk("q3", "comparison")]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.table.length, 2);
});

// Unification guardrail (the fort.cx bug): the headline named the category leader
// (top_competitor) while the proof body named the lead query's rival. Now ONE hero
// competitor drives every surface. Here Garmin has the single highest-intent loss,
// but the category leader Whoop ALSO loses at meaningful intent -> Whoop is hero,
// and lead/table/count all name Whoop, not Garmin.
function wearableProfile(): CompanyProfile {
  const p = profile();
  p.name = "Fort";
  p.competitors = [
    { name: "Whoop", aliases: [], confirmed: true },
    { name: "Garmin", aliases: [], confirmed: true },
  ];
  return p;
}

test("hero competitor unifies every surface on the elevated category leader", () => {
  const report = baseReport({
    client_name: "Fort",
    competitors: ["Whoop", "Garmin"],
    engines: ["perplexity", "openai", "gemini"],
    scorecard: { ...baseReport().scorecard, top_competitor: "Whoop" },
    losing_queries: [
      { query_id: "q1", intent: "category", engine_name: "perplexity", competitor: "Garmin" }, // highest leadScore, but a distractor
      { query_id: "q2", intent: "category", engine_name: "openai", competitor: "Whoop" }, // leader, meaningful intent -> elevates
      { query_id: "q3", intent: "comparison", engine_name: "gemini", competitor: "Whoop" },
      { query_id: "q4", intent: "problem_aware", engine_name: "perplexity", competitor: "Whoop" },
    ],
  });
  const mk = (id: string, engine: string, intent: string, resp: string): AnswerRecord => ({
    query_id: id, intent: intent as AnswerRecord["intent"], prompt: `${id}?`,
    engine_name: engine, run_index: 0, response: resp, citations: [], timestamp: "t",
  });
  const ans = [
    mk("q1", "perplexity", "category", "Garmin is the pick."),
    mk("q2", "openai", "category", "Whoop leads."),
    mk("q3", "gemini", "comparison", "Whoop wins."),
    mk("q4", "perplexity", "problem_aware", "Whoop is best."),
  ];
  const r = selectFindings(wearableProfile(), report, ans);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Every surface names Whoop — the H1 (heroCompetitor) can't diverge from the body.
  assert.equal(r.heroCompetitor, "Whoop");
  assert.equal(r.lead.competitor, "Whoop");
  assert.equal(r.headline.competitorName, "Whoop");
  for (const f of r.table) assert.equal(f.competitor, "Whoop");
  // The lead is the strongest WHOOP loss (q2), not the higher-scored Garmin loss (q1).
  assert.equal(r.lead.queryId, "q2");
  assert.ok(!r.table.some((f) => f.queryId === "q1"));
  // ...and it's still cross-engine: lead + table span three distinct engines.
  const engines = new Set([r.lead.engineName, ...r.table.map((f) => f.engineName)]);
  assert.equal(engines.size, 3);
});

// The mirror case: the category leader loses only on a WEAK-intent query (brand),
// so it is NOT elevated — the teaser headlines the rival it can actually prove
// with a strong loss (Garmin), rather than naming Whoop with no strong evidence.
test("leader is not elevated when it only loses at weak intent", () => {
  const report = baseReport({
    client_name: "Fort",
    competitors: ["Whoop", "Garmin"],
    scorecard: { ...baseReport().scorecard, top_competitor: "Whoop" },
    losing_queries: [
      { query_id: "q1", intent: "category", engine_name: "perplexity", competitor: "Garmin" },
      { query_id: "q2", intent: "brand", engine_name: "openai", competitor: "Whoop" }, // weak intent
    ],
  });
  const mk = (id: string, engine: string, intent: string): AnswerRecord => ({
    query_id: id, intent: intent as AnswerRecord["intent"], prompt: `${id}?`,
    engine_name: engine, run_index: 0, response: "rival wins.", citations: [], timestamp: "t",
  });
  const r = selectFindings(wearableProfile(), report, [mk("q1", "perplexity", "category"), mk("q2", "openai", "brand")]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.heroCompetitor, "Garmin");
  assert.equal(r.lead.competitor, "Garmin");
  assert.equal(r.headline.competitorName, "Garmin");
});

test("regex detection mode is refused", () => {
  const r = selectFindings(profile(), baseReport({ detection: "regex" }), answers());
  assert.equal(r.ok, false);
});

test("no losing queries -> no finding", () => {
  const r = selectFindings(profile(), baseReport({ losing_queries: [] }), answers());
  assert.equal(r.ok, false);
});

test("headline counts client absent, competitor present", () => {
  const r = selectFindings(profile(), baseReport(), answers());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.headline.companyAppears, 0);
  assert.equal(r.headline.competitorAppears, 2);
  assert.equal(r.headline.n, 2);
});

// Regression for the hero-engine-overrides-intent bug: a high-intent finding on a
// LESS credible engine must still win the lead over a low-intent finding on the
// most credible engine. The old code picked the hero engine by credibility alone,
// then took the best row on it — which discarded the comparison cell below.
test("lead follows intent even when the comparison is on a less-credible engine", () => {
  const report = baseReport({
    losing_queries: [
      // comparison (intent 5) on openai (cred 3) -> score 53
      { query_id: "q1", intent: "comparison", engine_name: "openai", competitor: "YNAB" },
      // brand (intent 1) on perplexity (cred 5) -> score 15
      { query_id: "q2", intent: "brand", engine_name: "perplexity", competitor: "YNAB" },
    ],
  });
  const ans: AnswerRecord[] = [
    {
      query_id: "q1", intent: "comparison", prompt: "best budgeting app vs YNAB?",
      engine_name: "openai", run_index: 0, response: "YNAB wins.", citations: [], timestamp: "t",
    },
    {
      query_id: "q2", intent: "brand", prompt: "is Acme any good?",
      engine_name: "perplexity", run_index: 0, response: "YNAB is better.", citations: [], timestamp: "t",
    },
  ];
  const r = selectFindings(profile(), report, ans);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // The comparison cell (q1) outscores the brand cell, so it leads — and the hero
  // engine follows the lead rather than being chosen on credibility alone.
  assert.equal(r.lead.queryId, "q1");
  assert.equal(r.lead.intent, "comparison");
  assert.equal(r.heroEngine, "openai");
});

// Regression for #2: a competitor named only by an alias still counts in the
// headline. Monarch Money's alias "Monarch" appears in q1's answer; the bare-name
// matcher would have missed it and undercounted competitorAppears.
test("headline counts competitor mentioned only by an alias", () => {
  const p = profile();
  p.competitors = [{ name: "Monarch Money", aliases: ["Monarch"], confirmed: true }];
  const report = baseReport({
    scorecard: { ...baseReport().scorecard, top_competitor: "Monarch Money" },
    losing_queries: [
      { query_id: "q1", intent: "category", engine_name: "openai", competitor: "Monarch Money" },
      { query_id: "q2", intent: "comparison", engine_name: "perplexity", competitor: "Monarch Money" },
    ],
  });
  const ans: AnswerRecord[] = [
    {
      query_id: "q1", intent: "category", prompt: "best budgeting app?", engine_name: "openai",
      run_index: 0, response: "Monarch is the leader.", citations: [], timestamp: "t",
    },
    {
      query_id: "q2", intent: "comparison", prompt: "alternatives?", engine_name: "perplexity",
      run_index: 0, response: "Monarch Money alternatives include YNAB.", citations: [], timestamp: "t",
    },
  ];
  const r = selectFindings(p, report, ans);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Both queries name the competitor (q1 via alias "Monarch", q2 by full name).
  assert.equal(r.headline.competitorAppears, 2);
});

function siteAudit(roadmap: SiteAuditPayload["roadmap"], present = true): SiteAuditPayload {
  return {
    present,
    domain: "acme.io",
    pages_crawled: 3,
    checks: [],
    summary: {},
    errors: 0,
    offsite: [],
    roadmap,
  };
}

test("selectWhyGaps: [] without a site audit / no gaps", () => {
  assert.deepEqual(selectWhyGaps(null), []);
  assert.deepEqual(selectWhyGaps(undefined), []);
  assert.deepEqual(selectWhyGaps(siteAudit([])), []);
  assert.deepEqual(selectWhyGaps(siteAudit([], false)), []); // present:false
});

test("selectWhyGaps orders by phase, fail-before-partial, then impact", () => {
  const gaps = selectWhyGaps(
    siteAudit([
      { category: "content", check_name: "fact density", status: "partial", impact_label: "Low", effort: "low", phase: 2 },
      { category: "technical", check_name: "robots.txt allows AI crawlers", status: "fail", impact_label: "High", effort: "low", phase: 1 },
      { category: "schema", check_name: "schema.org markup", status: "fail", impact_label: "Medium", effort: "medium", phase: 2 },
    ]),
    2,
  );
  assert.equal(gaps.length, 2);
  assert.equal(gaps[0]!.label, "robots.txt allows AI crawlers"); // phase 1 wins
  assert.equal(gaps[1]!.label, "schema.org markup"); // phase 2 fail/Medium beats phase 2 partial/Low
  assert.equal(gaps[0]!.status, "fail");
});

// Regression for #4: a losing row with no named competitor is not printable.
test("losing rows without a named competitor are refused", () => {
  const report = baseReport({
    losing_queries: [
      { query_id: "q1", intent: "comparison", engine_name: "perplexity", competitor: "  " },
      { query_id: "q2", intent: "category", engine_name: "openai", competitor: "" },
    ],
  });
  const r = selectFindings(profile(), report, answers());
  assert.equal(r.ok, false);
});
