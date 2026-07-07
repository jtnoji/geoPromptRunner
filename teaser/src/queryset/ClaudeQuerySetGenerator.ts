/**
 * ClaudeQuerySetGenerator — the real QuerySetGenerator: CompanyProfile -> a
 * teaser-grade GeneratedQuerySet, using Claude with the methodology rules as the
 * spec (docs/query-generation-plan.md; MockQuerySetGenerator.ts for the teaser cut).
 *
 * Hard rules honored (and ENFORCED post-hoc — see validateAndRepair):
 *   - >=2 comparison queries that do NOT name the client (test unprompted surfacing)
 *   - the client is named ONLY in the brand-intent query
 *   - every comparison query names exactly ONE competitor — never a closed
 *     head-to-head between two rivals ("is Whoop or Oura better?"), which the
 *     client can't win and so is worthless as proof (rubric rule A5; the shared
 *     MAX_COMPETITORS_PER_COMPARISON knob also backstops this in selectFindings)
 *   - weighted toward category/comparison (where teasers land)
 *   - 5 intent buckets: problem_aware | category | comparison | brand | adjacent_authority
 *
 * The LLM output is validated against the GeneratedQuery shape and the hard
 * rules; if a rule is violated we repair deterministically (and, as a last
 * resort, fall back to the same template set the mock uses) so the pipeline
 * never receives an invalid set.
 */

import { extractJson } from "../llm/claude.ts";
import {
  INTENTS,
  MAX_COMPETITORS_PER_COMPARISON,
  MIN_CLIENT_FREE_COMPARISONS,
  QUERY_COUNT,
  QUERY_WEIGHTS,
} from "../rubric/config.ts";
import { buildMatcher } from "../select/entity.ts";
import type {
  CompanyProfile,
  GeneratedQuery,
  GeneratedQuerySet,
} from "../types/domain.ts";
import type { IntentBucket } from "../types/platform.ts";
import type { QuerySetGenerator } from "./QuerySetGenerator.ts";

const VERSION = "teaser-claude-v1";

/** Raw query shape Claude returns (no weight/query_id — we assign those). */
interface RawQuery {
  text: string;
  intent: IntentBucket;
}

const QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    queries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          intent: {
            type: "string",
            enum: INTENTS,
          },
        },
        required: ["text", "intent"],
      },
    },
  },
  required: ["queries"],
} as const;

function systemPrompt(): string {
  return `You generate a small, teaser-grade set of real buyer questions for a competitive AI-visibility audit. The questions get asked verbatim to AI answer engines (ChatGPT, Perplexity, Google AI Overviews) to measure whether a company surfaces on its buyers' questions or whether competitors get recommended instead.

Tag each query with exactly one intent bucket:
- problem_aware: first-person buyer pain; NEVER name the category, the client, or any brand.
- category: "best <category> for X" style; may carry a real qualifier; do NOT name the client.
- comparison: "alternatives to <competitor>" / "<competitor> vs other options" — name exactly ONE competitor. At least TWO comparison queries must NOT name the client (these test whether the client surfaces unprompted).
- brand: bottom-funnel about the CLIENT specifically (this is the ONLY bucket that may name the client).
- adjacent_authority: a topic the client could plausibly own as an expert; name no brand.

Hard rules:
1. The client is named ONLY in brand-intent queries — never in category/comparison/problem_aware/adjacent_authority.
2. At least 2 comparison queries leave the client unnamed.
3. Every comparison query names EXACTLY ONE competitor. NEVER pit two rivals against each other ("is X or Y better?", "X vs Y") without the client — that bounds the answer to X and Y, so the client can't be recommended and the query proves nothing.
4. Weight the set toward category and comparison.
5. Write like a buyer talks to a chatbot — one question each, no compound asks, no leading queries that embed the answer.

Return ${QUERY_COUNT.min}-${QUERY_COUNT.max} queries total.`;
}

function userPrompt(profile: CompanyProfile): string {
  const competitorNames = profile.competitors.map((c) => c.name);
  return [
    `Client (the company being audited): ${profile.name}`,
    `Category: ${profile.category}`,
    `Competitors: ${competitorNames.length ? competitorNames.join(", ") : "(none provided — use real category leaders)"}`,
    "",
    "Generate the query set following the rules. Remember: name the client ONLY in brand queries; each comparison query names EXACTLY ONE competitor (never 'X or Y'); >=2 comparison queries leave the client unnamed.",
  ].join("\n");
}

/**
 * Validate the raw queries against the hard rules and repair deterministically.
 * Pure (no network) — the core of the tested logic.
 *
 * Repairs, in order:
 *   - drop empty/whitespace queries and any with an unknown intent
 *   - drop non-brand queries that name the client (rule 1 violation)
 *   - drop comparison queries that name no competitor (rule 3 violation)
 *   - drop comparison queries that name MORE THAN ONE competitor with no client
 *     (rule A5 / winnability — a closed head-to-head the client can't win)
 *   - if fewer than MIN_CLIENT_FREE_COMPARISONS client-free comparison queries
 *     survive, synthesize them from the template generator (rule 2)
 *   - if no brand query survives, synthesize one
 *   - if the whole set is unusable, fall back to the full template set
 * Then assign weights + sequential query_ids.
 */
export function validateAndRepair(
  profile: CompanyProfile,
  raw: RawQuery[],
): GeneratedQuery[] {
  const client = profile.name;
  // ONE matcher primitive, shared with selection + validation (Unicode + alias
  // aware): a comparison naming a rival only by an ALIAS ("is YNAB or Mint
  // better?") is just as unwinnable as one naming it canonically, so counting
  // must see aliases too (adversarial finding #6).
  const namesClient = buildMatcher(client);
  const compMatchers = profile.competitors
    .filter((c) => c.name.trim())
    .map((c) => buildMatcher(c.name, c.aliases));
  const countCompetitorsNamed = (text: string): number =>
    compMatchers.filter((m) => m(text)).length;

  // Rule A5 (winnability): a comparison naming >1 rival with no client is a
  // closed head-to-head ("is X or Y better?") — structurally unwinnable, so it
  // proves nothing and we never print it. Reject it wherever it appears.
  const isUnwinnableComparison = (q: RawQuery): boolean =>
    q.intent === "comparison" && !namesClient(q.text) && countCompetitorsNamed(q.text) > MAX_COMPETITORS_PER_COMPARISON;

  // Pass 1: keep only well-formed, rule-compliant queries.
  const kept: RawQuery[] = [];
  for (const q of raw) {
    const text = (q.text ?? "").trim();
    if (!text) continue;
    if (!INTENTS.includes(q.intent)) continue;
    // Rule 1: only brand queries may name the client.
    if (q.intent !== "brand" && namesClient(text)) continue;
    if (q.intent === "comparison") {
      // Rule 3: comparison queries must name a competitor.
      if (countCompetitorsNamed(text) < 1) continue;
      // Rule A5: no closed head-to-heads (see above).
      if (isUnwinnableComparison({ text, intent: q.intent })) continue;
    }
    kept.push({ text, intent: q.intent });
  }

  // Rule 2: ensure >=MIN_CLIENT_FREE_COMPARISONS comparison queries that do NOT
  // name the client.
  const clientFreeComparisons = kept.filter(
    (q) => q.intent === "comparison" && !namesClient(q.text),
  );
  const needed = MIN_CLIENT_FREE_COMPARISONS - clientFreeComparisons.length;
  if (needed > 0) {
    for (const synth of synthComparisons(profile, needed)) kept.push(synth);
  }

  // Ensure at least one brand query exists (the only client-named slot).
  if (!kept.some((q) => q.intent === "brand")) {
    kept.push({ intent: "brand", text: brandTemplate(client) });
  }

  // Last resort: if somehow nothing usable remains, use the full template set.
  // Re-run the winnability filter over the FINAL list: synth/template queries
  // interpolate profile.category verbatim and were never pass-1 checked, so a
  // category that word-matches a rival ("Salesforce-style CRM") could otherwise
  // smuggle a second competitor into a comparison (adversarial finding #7).
  const usable = (kept.length >= 3 ? kept : templateQueries(profile)).filter(
    (q) => !isUnwinnableComparison(q),
  );

  return usable.map(
    (q, i): GeneratedQuery => ({
      query_id: `q${String(i + 1).padStart(2, "0")}`,
      text: q.text,
      intent: q.intent,
      weight: QUERY_WEIGHTS[q.intent],
      persona: null,
    }),
  );
}

/**
 * Synthesize up to `n` client-free comparison queries from REAL competitors.
 * Every synthesized query names EXACTLY ONE actual competitor (rules 3 + A5) — so
 * each stays winnable ("could the client surface as the alternative to X?") and
 * none is a closed head-to-head. When the profile has no competitors we
 * synthesize nothing rather than emit bogus "alternatives to the market leader"
 * queries that name no real rival (which would make the comparison audit
 * meaningless and corrupt the headline number).
 */
function synthComparisons(profile: CompanyProfile, n: number): RawQuery[] {
  const comps = profile.competitors.map((c) => c.name).filter(Boolean);
  if (comps.length === 0 || n <= 0) return [];
  const cat = profile.category;
  const c1 = comps[0];
  const c2 = comps[1] ?? comps[0];
  // Each candidate names ONE rival — never "c1 or c2" (a head-to-head). When
  // there are two rivals we anchor the two queries on different ones for variety.
  const candidates: RawQuery[] = [
    { intent: "comparison", text: `What are the best alternatives to ${c1}?` },
    {
      intent: "comparison",
      text: `${c2} vs other ${cat} options — which should I pick?`,
    },
    { intent: "comparison", text: `Is ${c2} worth it, or is there something better?` },
  ];
  return candidates.slice(0, n);
}

function brandTemplate(client: string): string {
  return `Is ${client} any good — what do people think of it?`;
}

/**
 * The full deterministic template set (mirrors MockQuerySetGenerator's hard-rule
 * shape). Used only as a total fallback when the LLM output is unusable.
 */
function templateQueries(profile: CompanyProfile): RawQuery[] {
  const cat = profile.category;
  const client = profile.name;
  const comps = profile.competitors.map((c) => c.name).filter(Boolean);
  // Comparison queries are only valid when we have a real competitor to name
  // (rule 3). Without one, fall back to extra category/problem queries so the
  // set stays usable instead of naming a placeholder "market leader".
  const comparisons: RawQuery[] = comps.length
    ? [
        { intent: "comparison", text: `What are the best alternatives to ${comps[0]}?` },
        {
          intent: "comparison",
          text: `${comps[0]} vs other ${cat} options — which should I pick?`,
        },
      ]
    : [
        { intent: "category", text: `What ${cat} do people switch to and why?` },
        {
          intent: "problem_aware",
          text: `What should I look for when comparing my options?`,
        },
      ];
  return [
    { intent: "category", text: `What's the best ${cat} for a growing startup?` },
    { intent: "category", text: `Which ${cat} do people recommend in 2026?` },
    ...comparisons,
    {
      intent: "problem_aware",
      text: `How do I choose something that scales with my needs?`,
    },
    {
      intent: "adjacent_authority",
      text: `What do experts say are the top ${cat} options right now?`,
    },
    { intent: "brand", text: brandTemplate(client) },
  ];
}

export class ClaudeQuerySetGenerator implements QuerySetGenerator {
  async generate(profile: CompanyProfile): Promise<GeneratedQuerySet> {
    let raw: RawQuery[] = [];
    try {
      const result = await extractJson<{ queries: RawQuery[] }>(
        systemPrompt(),
        userPrompt(profile),
        QUERY_SCHEMA as unknown as Record<string, unknown>,
      );
      raw = Array.isArray(result.queries) ? result.queries : [];
    } catch {
      // Leave raw empty -> validateAndRepair falls back to the template set.
      raw = [];
    }

    const queries = validateAndRepair(profile, raw);
    return { version: VERSION, queries };
  }
}
