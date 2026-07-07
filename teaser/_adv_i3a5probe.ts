import { validateDraft } from "./src/rubric/validate.ts";
import { validateAndRepair } from "./src/queryset/ClaudeQuerySetGenerator.ts";
import { headline } from "./src/render/copy.ts";
import type { Finding, TeaserDraft } from "./src/types/domain.ts";
import type { AnswerRecord, ReportPayload } from "./src/types/platform.ts";
import type { CompanyProfile, Competitor } from "./src/types/domain.ts";

// ─────────── baseline validDraft() copied from tests/rubric.test.ts ───────────
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
  const mk = (query_id: string, engine_name: string, prompt: string, response: string): AnswerRecord => ({
    query_id, intent: "category", prompt, engine_name, run_index: 0, response, citations: [], timestamp: "t",
  });
  return [
    mk("q1", "perplexity", "best recovery wearable?", "Whoop leads."),
    mk("q2", "openai", "what are the best alternatives to Oura?", "Whoop is the top alternative."),
    mk("q3", "gemini", "is Fort any good?", "Fort is decent, honestly."),
  ];
}
function leadFinding(): Finding {
  return {
    role: "lead", source: "losing_query", queryId: "q1", intent: "category", engineName: "perplexity",
    competitor: "Whoop", verbatimQuery: "best recovery wearable?", verbatimAnswer: "Whoop leads.",
    citations: ["https://reddit.com/x"], rankScore: 50,
  };
}
function tableFinding(): Finding {
  return {
    role: "table", source: "losing_query", queryId: "q2", intent: "comparison", engineName: "openai",
    competitor: "Whoop", verbatimQuery: "what are the best alternatives to Oura?",
    verbatimAnswer: "Whoop is the top alternative.", citations: [], rankScore: 55,
  };
}
function validDraft(): TeaserDraft {
  return {
    prospectUrl: "https://fort.cx", companyName: "Fort", category: "recovery wearable", runDate: "2026-06-20",
    heroEngine: "perplexity", heroCompetitor: "Whoop", headline: headline("Fort", "Whoop"), leadSentence: "…",
    headlineNumber: { companyAppears: 1, competitorAppears: 2, competitorName: "Whoop", n: 3, lostRecommendations: 2, enginesCovered: 3 },
    stakesLine: "…", cta: "…", lead: leadFinding(), table: [tableFinding()], report: report(), answers: answers(), status: "draft",
  };
}
const blocks = (d: TeaserDraft) => validateDraft(d).filter((v) => v.severity === "block");
const blockRules = (d: TeaserDraft) => blocks(d).map((v) => `${v.rule}:${v.surface}`);

function log(title: string, obj: unknown) {
  console.log(`\n===== ${title} =====`);
  console.log(JSON.stringify(obj, null, 2));
}

// Sanity: baseline passes clean
log("BASELINE validDraft blocks (expect [])", blockRules(validDraft()));

// ─────────────────────────────────────────────────────────────────────────────
// I3 ATTACK 1: closed head-to-head named by ALIAS only.
// competitors names = ["You Need A Budget", "Mint"]; printed query "YNAB vs Mint".
// validateDraft matchers use NAME ONLY, so "YNAB" won't match -> count=1 -> no block.
// This IS a genuine closed head-to-head (2 rivals, client absent).
// ─────────────────────────────────────────────────────────────────────────────
{
  const d = validDraft();
  d.companyName = "Fort";
  d.heroCompetitor = "Mint";
  d.report = report({ competitors: ["You Need A Budget", "Mint"], scorecard: { ...report().scorecard, top_competitor: "Mint" } });
  d.headline = headline("Fort", "Mint");
  d.headlineNumber = { ...d.headlineNumber, competitorName: "Mint" };
  const q = "YNAB vs Mint — which budgeting app is better?";
  d.lead = { ...leadFinding(), competitor: "Mint", verbatimQuery: q, verbatimAnswer: "Mint wins.", queryId: "q1", engineName: "perplexity" };
  d.answers = [
    { query_id: "q1", intent: "comparison", prompt: q, engine_name: "perplexity", run_index: 0, response: "Mint wins.", citations: [], timestamp: "t" },
    { query_id: "q3", intent: "brand", prompt: "is Fort any good?", engine_name: "gemini", run_index: 0, response: "Fort is decent.", citations: [], timestamp: "t" },
  ];
  d.table = [];
  log("I3-A1 alias head-to-head 'YNAB vs Mint' (competitors name-only) blocks", blockRules(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// I3 ATTACK 2: 3+ rivals in one printed query (all by NAME). Should block (count>1).
// ─────────────────────────────────────────────────────────────────────────────
{
  const d = validDraft();
  d.report = report({ competitors: ["Whoop", "Oura", "Garmin"] });
  const q = "is Whoop, Oura, or Garmin better for recovery?";
  d.lead = { ...leadFinding(), verbatimQuery: q, verbatimAnswer: "Whoop.", queryId: "q1" };
  d.answers = [
    { query_id: "q1", intent: "comparison", prompt: q, engine_name: "perplexity", run_index: 0, response: "Whoop.", citations: [], timestamp: "t" },
    ...answers().slice(1),
  ];
  d.table = [];
  log("I3-A2 3 rivals by name 'Whoop, Oura, or Garmin' blocks (expect I3)", blockRules(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// I3 ATTACK 3: "X vs Y" where one is the CLIENT — should be ALLOWED (no block).
// ─────────────────────────────────────────────────────────────────────────────
{
  const d = validDraft();
  const q = "Fort vs Whoop — which recovery wearable is better?";
  d.lead = { ...leadFinding(), verbatimQuery: q, verbatimAnswer: "Whoop leads.", queryId: "q1" };
  d.answers = [
    { query_id: "q1", intent: "comparison", prompt: q, engine_name: "perplexity", run_index: 0, response: "Whoop leads.", citations: [], timestamp: "t" },
    ...answers().slice(1),
  ];
  d.table = [];
  log("I3-A3 client-in-query 'Fort vs Whoop' blocks (expect [], no false-block)", blockRules(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// I3 ATTACK 4: unicode / word-boundary tricks.
// buildMatcher uses ASCII \b with NO 'u' flag. Compare rival separated by unicode.
// (a) rivals joined by an em dash / punctuation.
// (b) client name that fails ASCII \b (e.g. "C++") in a genuine client-vs-two-rivals.
// ─────────────────────────────────────────────────────────────────────────────
{
  const d = validDraft();
  const q = "Whoop—Oura: which wins?"; // em dash between two rivals, client absent
  d.lead = { ...leadFinding(), verbatimQuery: q, verbatimAnswer: "Whoop.", queryId: "q1" };
  d.answers = [
    { query_id: "q1", intent: "comparison", prompt: q, engine_name: "perplexity", run_index: 0, response: "Whoop.", citations: [], timestamp: "t" },
    ...answers().slice(1),
  ];
  d.table = [];
  log("I3-A4a em-dash 'Whoop—Oura' blocks (expect I3)", blockRules(d));
}
{
  // client "C++" fails ASCII \b at trailing '+' -> genuine client-named query wrongly flagged?
  const d = validDraft();
  d.companyName = "C++";
  d.heroCompetitor = "Rust";
  d.report = report({ competitors: ["Rust", "Go"], client_name: "C++", scorecard: { ...report().scorecard, top_competitor: "Rust" } });
  d.headline = "AI sends devs to Rust, not C++."; // include hero
  d.headlineNumber = { ...d.headlineNumber, competitorName: "Rust" };
  const q = "C++ vs Rust vs Go — which language should I learn?"; // client IS named
  d.lead = { ...leadFinding(), competitor: "Rust", verbatimQuery: q, verbatimAnswer: "Rust.", queryId: "q1" };
  d.answers = [
    { query_id: "q1", intent: "comparison", prompt: q, engine_name: "perplexity", run_index: 0, response: "Rust.", citations: [], timestamp: "t" },
    { query_id: "q3", intent: "brand", prompt: "is C++ good?", engine_name: "gemini", run_index: 0, response: "C++ decent.", citations: [], timestamp: "t" },
  ];
  d.table = [];
  log("I3-A4b client 'C++' named in query, ASCII \\b -> false-block? blocks", blockRules(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// I3 ATTACK 5: two rivals where one appears via a word-boundary evasion in the
// query text but the competitor NAME differs. e.g. rival "Oura" printed as "Oura's".
// count still trips? Whoop + Oura's -> \bOura\b matches "Oura's" (apostrophe is non-word)
// ─────────────────────────────────────────────────────────────────────────────
{
  const d = validDraft();
  const q = "Is Whoop or Oura's tracker the better pick?";
  d.lead = { ...leadFinding(), verbatimQuery: q, verbatimAnswer: "Whoop.", queryId: "q1" };
  d.answers = [
    { query_id: "q1", intent: "comparison", prompt: q, engine_name: "perplexity", run_index: 0, response: "Whoop.", citations: [], timestamp: "t" },
    ...answers().slice(1),
  ];
  d.table = [];
  log("I3-A5 'Whoop or Oura's' blocks (expect I3)", blockRules(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// GEN-HOLE probes: validateAndRepair
// ─────────────────────────────────────────────────────────────────────────────
function profile(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    url: "https://fort.cx", name: "Fort", category: "recovery wearable",
    competitors: [
      { name: "Whoop", aliases: [], confirmed: true },
      { name: "Oura", aliases: [], confirmed: true },
    ],
    clientDomains: ["fort.cx"], productClaims: [], resolvedAt: "t", resolverModel: "m",
    ...over,
  };
}
const comparisons = (qs: { text: string; intent: string }[]) => qs.filter((q) => q.intent === "comparison").map((q) => q.text);

// GEN 1: LLM outputs two rivals by NAME "is Whoop or Oura better?" -> should be dropped.
{
  const out = validateAndRepair(profile(), [
    { text: "is Whoop or Oura better for recovery?", intent: "comparison" },
    { text: "best recovery wearable for runners?", intent: "category" },
    { text: "how do I recover faster after training?", intent: "problem_aware" },
  ]);
  log("GEN1 'Whoop or Oura' two-name head-to-head -> comparison outputs", comparisons(out));
}

// GEN 2: LLM outputs two rivals where ONE is an ALIAS.
// competitor "You Need A Budget" alias "YNAB"; competitor "Mint". Query "YNAB or Mint?".
// countCompetitorsNamed uses NAMES ONLY -> counts only "Mint" (1) -> KEPT. LEAK.
{
  const p = profile({
    name: "Fort",
    category: "budgeting app",
    competitors: [
      { name: "You Need A Budget", aliases: ["YNAB"], confirmed: true },
      { name: "Mint", aliases: [], confirmed: true },
    ],
  });
  const out = validateAndRepair(p, [
    { text: "Is YNAB or Mint the better budgeting app?", intent: "comparison" },
    { text: "best budgeting app for couples?", intent: "category" },
    { text: "how do I stick to a budget?", intent: "problem_aware" },
  ]);
  log("GEN2 alias head-to-head 'YNAB or Mint' -> comparison outputs (LEAK if present)", comparisons(out));
}

// GEN 3: "A or B" with both by name but no explicit 'vs' -> should still be dropped.
{
  const out = validateAndRepair(profile(), [
    { text: "Should I get Whoop or Oura?", intent: "comparison" },
    { text: "best recovery wearable?", intent: "category" },
    { text: "recover faster tips?", intent: "problem_aware" },
  ]);
  log("GEN3 'Whoop or Oura' (or-phrasing) -> comparison outputs", comparisons(out));
}

// GEN 4: synthComparisons fallback where CATEGORY embeds a competitor name.
// No client-free comparisons survive -> synth fires. c2 = comps[1]. If category
// contains comps[0] name, synth query "c2 vs other <category> options" names 2 rivals.
{
  const p = profile({
    name: "Fort",
    category: "Whoop-style recovery band", // category text embeds rival "Whoop"
    competitors: [
      { name: "Whoop", aliases: [], confirmed: true },
      { name: "Oura", aliases: [], confirmed: true },
    ],
  });
  // Provide NO comparison queries so synth must fire to reach MIN_CLIENT_FREE_COMPARISONS.
  const out = validateAndRepair(p, [
    { text: "best recovery band for athletes?", intent: "category" },
    { text: "how do I recover faster?", intent: "problem_aware" },
    { text: "is Fort any good?", intent: "brand" },
  ]);
  log("GEN4 synth w/ category embedding 'Whoop' -> comparison outputs (LEAK if 'Oura vs ...Whoop...' present)", comparisons(out));
}

// GEN 5: total fallback templateQueries with category embedding a competitor.
{
  const p = profile({
    name: "Fort",
    category: "Oura-like ring", // embeds rival "Oura"
    competitors: [
      { name: "Whoop", aliases: [], confirmed: true },
      { name: "Oura", aliases: [], confirmed: true },
    ],
  });
  // Empty raw -> not the full fallback path here (validateAndRepair synth path). Force
  // the total fallback by making everything unusable: raw all invalid.
  const out = validateAndRepair(p, []);
  log("GEN5 empty raw -> comparison outputs (template path)", comparisons(out));
}

// GEN 6: alias where the ALIAS is what the query uses for BOTH... single competitor
// with alias, plus a second competitor. Query names first comp by NAME + second by ALIAS.
{
  const p = profile({
    name: "Fort",
    category: "recovery wearable",
    competitors: [
      { name: "Whoop", aliases: [], confirmed: true },
      { name: "Oura Ring", aliases: ["Oura"], confirmed: true },
    ],
  });
  // Query uses "Whoop" (name) and "Oura" (alias of "Oura Ring"). countCompetitorsNamed
  // matches "Whoop" (1). "Oura Ring" name not present. -> named=1 -> KEPT. LEAK.
  const out = validateAndRepair(p, [
    { text: "Whoop or Oura — which recovery tracker?", intent: "comparison" },
    { text: "best recovery tracker?", intent: "category" },
    { text: "recover faster?", intent: "problem_aware" },
  ]);
  log("GEN6 name+alias 'Whoop or Oura' (Oura=alias of 'Oura Ring') -> comparison outputs (LEAK if present)", comparisons(out));
}
