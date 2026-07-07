/**
 * The teaser rubric — CONFIG layer.
 *
 * The single declarative source of the teaser's tunable rules (BUILD_PLAN.md §7
 * #8: "config, not code"). Both the GENERATORS (query-set generation + finding
 * selection) and the VALIDATOR read these values, so a rule is defined ONCE here
 * instead of being hard-coded (and drifting) across five functions. Change a
 * weight, cap, or threshold HERE.
 *
 * The rules themselves — what each value means and the failure mode it guards
 * against — are documented in teaser/RUBRIC.md; the checkable invariants are
 * enforced by src/rubric/validate.ts.
 */

import type { IntentBucket } from "../types/platform.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A · Query instrument (generation) — see ClaudeQuerySetGenerator.ts
// ─────────────────────────────────────────────────────────────────────────────

/** The 5 funnel-stage intent buckets (src/prompts/intent.py). */
export const INTENTS: IntentBucket[] = [
  "problem_aware",
  "category",
  "comparison",
  "brand",
  "adjacent_authority",
];

/**
 * Per-bucket weight submitted to the platform — heavier on category/comparison
 * (where teasers land). NOTE: this is the platform *query weight*, distinct from
 * the selection priorities below (which rank findings for the teaser surfaces).
 */
export const QUERY_WEIGHTS: Record<IntentBucket, number> = {
  problem_aware: 1.0,
  category: 1.4,
  comparison: 1.8,
  brand: 2.0,
  adjacent_authority: 1.0,
};

/** How many queries a teaser-grade set should contain (guidance to the LLM). */
export const QUERY_COUNT = { min: 7, max: 9 } as const;

/**
 * Rule A3 — at least this many comparison queries must leave the client unnamed,
 * so the set actually tests whether the client surfaces UNPROMPTED.
 */
export const MIN_CLIENT_FREE_COMPARISONS = 2;

/**
 * Rule A5 (winnability) — the shared knob behind the closed-head-to-head rule at
 * BOTH ends of the pipeline. A comparison query may name AT MOST this many
 * competitors: naming two or more rivals while leaving the client out ("is Whoop
 * or Oura better?") bounds the answer to the brands the buyer offered, so the
 * client CAN'T be the answer — its absence is a non-result, not a loss.
 *   - GENERATION drops/repairs any comparison naming more than this (prevention).
 *   - SELECTION excludes any query that names more than this AND omits the client,
 *     from the lead, table, and headline count (backstop).
 */
export const MAX_COMPETITORS_PER_COMPARISON = 1;

// ─────────────────────────────────────────────────────────────────────────────
// B · Finding selection — see selectFindings.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commercial-intent priority for ranking the PATTERN TABLE rows (comparison is
 * bottom-funnel and the strongest corroboration). `?? 0` at the call site guards
 * an unweighted intent the platform might add.
 */
export const INTENT_PRIORITY: Record<IntentBucket, number> = {
  comparison: 5,
  category: 4,
  problem_aware: 3,
  adjacent_authority: 2,
  brand: 1,
};

/**
 * LEAD priority — favors demand-side queries where the buyer is open and the
 * client's absence is unambiguous (category > problem_aware) over comparison
 * queries that name rivals (a weaker hero hook). Comparisons still dominate the
 * table via INTENT_PRIORITY.
 */
export const LEAD_INTENT_PRIORITY: Record<IntentBucket, number> = {
  category: 5,
  problem_aware: 4,
  comparison: 3,
  adjacent_authority: 2,
  brand: 1,
};

/** Engine credibility for hero selection + scoring (BUILD_PLAN.md §4d). */
export const ENGINE_CREDIBILITY: Record<string, number> = {
  perplexity: 5,
  ai_overviews: 5,
  google_ai_overviews: 5,
  openai: 3,
  openai_search: 4,
  gemini: 2,
  gemini_grounded: 3,
  anthropic: 2,
  anthropic_search: 3,
};

/**
 * Fold engine aliases + case to ONE identity for the CROSS-MODEL count only
 * (I4 / `enginesCovered`) — so `ai_overviews` and `google_ai_overviews`, or a
 * search variant vs its base, don't inflate "the same rival beats you across N
 * engines" into counting one model twice. Credibility scoring keeps the raw name
 * (search variants are genuinely more credible), so this is separate from
 * ENGINE_CREDIBILITY on purpose.
 */
const ENGINE_CANONICAL: Record<string, string> = {
  perplexity: "perplexity",
  ai_overviews: "ai_overviews",
  google_ai_overviews: "ai_overviews",
  openai: "openai",
  openai_search: "openai",
  gemini: "gemini",
  gemini_grounded: "gemini",
  anthropic: "anthropic",
  anthropic_search: "anthropic",
};

export function canonicalEngine(engine: string): string {
  const key = engine.trim().toLowerCase();
  return ENGINE_CANONICAL[key] ?? key;
}

/**
 * Buyer intents strong enough to justify HEADLINING a rival. The category leader
 * is only elevated to hero when it loses on one of these — a weak brand-tier or
 * adjacent-authority loss isn't a persuasive enough proof to build the H1 on.
 */
export const MEANINGFUL_INTENT: ReadonlySet<IntentBucket> = new Set<IntentBucket>([
  "category",
  "comparison",
  "problem_aware",
]);

/** How many corroborating rows the pattern table aims to hold (besides the lead). */
export const TABLE_SIZE = 2;
