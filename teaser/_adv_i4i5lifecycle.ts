import { validateDraft } from "./src/rubric/validate.ts";
import { assembleDraft } from "./src/pipeline.ts";
import { headline } from "./src/render/copy.ts";
import type { Finding, TeaserDraft } from "./src/types/domain.ts";
import type { AnswerRecord, ReportPayload, LosingRow } from "./src/types/platform.ts";
import type { CompanyProfile } from "./src/types/domain.ts";

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
    competitor: "Whoop", verbatimQuery: "what are the best alternatives to Oura?", verbatimAnswer: "Whoop is the top alternative.",
    citations: [], rankScore: 55,
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
const rules = (d: TeaserDraft) => validateDraft(d).map((v) => `${v.rule}:${v.severity}`);
function safe(label: string, fn: () => unknown) {
  try { const r = fn(); console.log(label, "=>", JSON.stringify(r)); }
  catch (e) { console.log(label, "=> THREW:", (e as Error).message); }
}

console.log("=== BASELINE ===");
safe("baseline validateDraft()", () => validateDraft(validDraft()));

console.log("\n=== I5 attacks ===");
{ const d = validDraft(); d.report = report({ detection: "regex" as any }); console.log("detection=regex blocks:", JSON.stringify(blocks(d).map(b=>b.rule))); }
{ const d = validDraft(); (d.report as any).detection = undefined; console.log("detection=undefined blocks:", JSON.stringify(blocks(d).map(b=>b.rule))); }
{ const d = validDraft(); (d.report as any).detection = "Judge"; console.log("detection='Judge'(caps) blocks:", JSON.stringify(blocks(d).map(b=>b.rule))); }
{ const d = validDraft(); (d.report as any).detection = "judge "; console.log("detection='judge '(trailing space) blocks:", JSON.stringify(blocks(d).map(b=>b.rule))); }
safe("t.report=undefined (malformed)", () => { const d = validDraft(); (d as any).report = undefined; return validateDraft(d); });
safe("t.report=null (malformed)", () => { const d = validDraft(); (d as any).report = null; return validateDraft(d); });

console.log("\n=== I4: can it ever BLOCK? worst-case single-engine printed, multi-engine data ===");
{
  const d = validDraft();
  d.table = [{ ...tableFinding(), engineName: "perplexity" }];
  d.answers = [...answers(), { query_id: "q2", intent: "comparison", prompt: "what are the best alternatives to Oura?", engine_name: "perplexity", run_index: 0, response: "Whoop is the top alternative.", citations: [], timestamp: "t" }];
  const vs = validateDraft(d);
  console.log("I4 present:", vs.some(v=>v.rule==="I4"), "| I4 severities:", JSON.stringify(vs.filter(v=>v.rule==="I4").map(v=>v.severity)), "| any block:", vs.some(v=>v.severity==="block"));
}

console.log("\n=== I4 MISS: engine-name case variance fools printedEngines (really single-engine, size 2) ===");
{
  const d = validDraft();
  // Both printed findings are really Perplexity, differing only by case.
  d.lead = { ...leadFinding(), engineName: "perplexity" };
  d.table = [{ ...tableFinding(), queryId: "q2b", engineName: "Perplexity" }];
  d.answers = [
    { query_id: "q1", intent: "category", prompt: "best recovery wearable?", engine_name: "perplexity", run_index: 0, response: "Whoop leads.", citations: [], timestamp: "t" },
    { query_id: "q2b", intent: "comparison", prompt: "what are the best alternatives to Oura?", engine_name: "Perplexity", run_index: 0, response: "Whoop is the top alternative.", citations: [], timestamp: "t" },
    { query_id: "q3", intent: "category", prompt: "is Fort any good?", engine_name: "gemini", run_index: 0, response: "Fort is decent.", citations: [], timestamp: "t" },
  ];
  const vs = validateDraft(d);
  const distinct = new Set(d.answers.filter(a=>a.response).map(a=>a.engine_name));
  const printedE = new Set([d.lead, ...d.table].map(f=>f.engineName));
  console.log("distinctEngines:", JSON.stringify([...distinct]), "printedEngines:", JSON.stringify([...printedE]));
  console.log("I4 fired?", vs.some(v=>v.rule==="I4"), "(EXPECTED: should warn - both printed are really Perplexity)");
  console.log("all rules:", JSON.stringify(vs.map(v=>`${v.rule}:${v.severity}`)));
}

console.log("\n=== I4 MISS #2: openai vs openai_search treated as 2 engines ===");
{
  const d = validDraft();
  d.lead = { ...leadFinding(), engineName: "openai" };
  d.table = [{ ...tableFinding(), queryId: "q2c", engineName: "openai_search" }];
  d.answers = [
    { query_id: "q1", intent: "category", prompt: "best recovery wearable?", engine_name: "openai", run_index: 0, response: "Whoop leads.", citations: [], timestamp: "t" },
    { query_id: "q2c", intent: "comparison", prompt: "what are the best alternatives to Oura?", engine_name: "openai_search", run_index: 0, response: "Whoop is the top alternative.", citations: [], timestamp: "t" },
    { query_id: "q3", intent: "category", prompt: "is Fort any good?", engine_name: "gemini", run_index: 0, response: "Fort is decent.", citations: [], timestamp: "t" },
  ];
  const vs = validateDraft(d);
  console.log("I4 fired?", vs.some(v=>v.rule==="I4"), "(both are OpenAI family)");
  console.log("all rules:", JSON.stringify(vs.map(v=>`${v.rule}:${v.severity}`)));
}

console.log("\n=== LIFECYCLE: nonsense status ignored by validateDraft ===");
{ const d = validDraft(); (d as any).status = "exported"; console.log("status=exported violations:", JSON.stringify(rules(d))); }
{ const d = validDraft(); (d as any).status = "approved"; console.log("status=approved violations:", JSON.stringify(rules(d))); }
{ const d = validDraft(); (d as any).status = "TOTALLY_BOGUS"; console.log("status=TOTALLY_BOGUS violations:", JSON.stringify(rules(d))); }

console.log("\n=== MALFORMED INPUT crashes ===");
safe("t.table=undefined", () => { const d = validDraft(); (d as any).table = undefined; return validateDraft(d).map(v=>v.rule); });
safe("t.answers=undefined", () => { const d = validDraft(); (d as any).answers = undefined; return validateDraft(d).map(v=>v.rule); });
safe("t.headlineNumber=undefined", () => { const d = validDraft(); (d as any).headlineNumber = undefined; return validateDraft(d).map(v=>v.rule); });
safe("t.lead=undefined", () => { const d = validDraft(); (d as any).lead = undefined; return validateDraft(d).map(v=>v.rule); });
safe("t.report.competitors=undefined", () => { const d = validDraft(); (d.report as any).competitors = undefined; return validateDraft(d).map(v=>v.rule); });

console.log("\n=== ASSEMBLEDRAFT: does it SHIP an I4-warn draft (should: yes, ok:true) ===");
{
  const profile: CompanyProfile = {
    url: "https://fort.cx", name: "Fort", category: "recovery wearable",
    competitors: [{ name: "Whoop", aliases: [], confirmed: true }, { name: "Oura", aliases: [], confirmed: true }],
    clientDomains: ["fort.cx"], productClaims: [], resolvedAt: "", resolverModel: "m",
  };
  // All losing queries on perplexity -> single-engine printed, but answers span 2 engines.
  const losing: LosingRow[] = [
    { query_id: "q1", intent: "category", engine_name: "perplexity", competitor: "Whoop" },
    { query_id: "q2", intent: "comparison", engine_name: "perplexity", competitor: "Whoop" },
  ];
  const rep = report({ losing_queries: losing, engines: ["perplexity", "openai"] });
  const ans: AnswerRecord[] = [
    { query_id: "q1", intent: "category", prompt: "best recovery wearable?", engine_name: "perplexity", run_index: 0, response: "Whoop leads.", citations: [], timestamp: "t" },
    { query_id: "q2", intent: "comparison", prompt: "what are the best alternatives to Oura?", engine_name: "perplexity", run_index: 0, response: "Whoop wins.", citations: [], timestamp: "t" },
    { query_id: "q4", intent: "category", prompt: "top wearable brands?", engine_name: "openai", run_index: 0, response: "Garmin and others.", citations: [], timestamp: "t" },
  ];
  const res = assembleDraft(profile, rep, ans, "https://fort.cx");
  console.log("assembleDraft ok:", res.ok);
  if (res.ok) console.log("  shipped, warnings:", JSON.stringify((res.draft.warnings ?? []).map(w=>`${w.rule}:${w.severity}`)), "status:", res.draft.status);
  else console.log("  blocked:", res.stage, res.reason);
}

console.log("\n=== ASSEMBLEDRAFT: does it BLOCK a real block-violation (profile competitors subset of report -> validate I3) ===");
{
  // profile only knows Whoop; report knows Whoop+Oura. A losing query 'is Whoop or Oura better?'
  // select's matcher (Whoop only) sees 1 competitor -> NOT excluded -> printed as lead.
  // validate's matcher (report.competitors Whoop+Oura) sees 2 -> I3 closed head-to-head BLOCK.
  const profile: CompanyProfile = {
    url: "https://fort.cx", name: "Fort", category: "recovery wearable",
    competitors: [{ name: "Whoop", aliases: [], confirmed: true }],
    clientDomains: ["fort.cx"], productClaims: [], resolvedAt: "", resolverModel: "m",
  };
  const losing: LosingRow[] = [
    { query_id: "q1", intent: "category", engine_name: "perplexity", competitor: "Whoop" },
  ];
  const rep = report({ losing_queries: losing, competitors: ["Whoop", "Oura"] });
  const ans: AnswerRecord[] = [
    { query_id: "q1", intent: "category", prompt: "is Whoop or Oura better for recovery?", engine_name: "perplexity", run_index: 0, response: "Whoop is better.", citations: [], timestamp: "t" },
  ];
  const res = assembleDraft(profile, rep, ans, "https://fort.cx");
  console.log("assembleDraft ok:", res.ok);
  if (res.ok) console.log("  !!! SHIPPED A DRAFT with printed query:", res.draft.lead.verbatimQuery, "-> BLOCK MISS");
  else console.log("  correctly blocked:", res.stage, "|", res.reason);
}
