/** teaserAuto's own domain types (the data it owns; see BUILD_PLAN.md §3). */

import type { AnswerRecord, IntentBucket, ReportPayload } from "./platform.ts";

export interface Competitor {
  name: string;
  aliases: string[];
  /** Whether a human confirmed this competitor at the input gate. */
  confirmed: boolean;
}

/** Resolver output: URL → company profile. */
export interface CompanyProfile {
  url: string;
  name: string;
  category: string;
  competitors: Competitor[];
  clientDomains: string[];
  /** Optional claims that could seed a fact sheet (wrong-claim branch; manual). */
  productClaims: { claim: string; sourceUrl: string }[];
  resolvedAt: string;
  resolverModel: string;
}

/** One generated buyer query (platform Query shape + our metadata). */
export interface GeneratedQuery {
  query_id: string;
  text: string;
  intent: IntentBucket;
  weight: number;
  persona: string | null;
}

/** The teaser-grade query set we generate and submit to the platform. */
export interface GeneratedQuerySet {
  version: string;
  queries: GeneratedQuery[];
}

/** A selected finding (lead or pattern-table row), joined to verbatim text. */
export interface Finding {
  role: "lead" | "table";
  source: "losing_query" | "accuracy_flag";
  queryId: string;
  intent: IntentBucket;
  engineName: string;
  competitor: string;
  verbatimQuery: string;
  verbatimAnswer: string;
  citations: string[];
  rankScore: number;
}

/** The "appears in X of N / competitor in Y of N" headline metric. */
export interface HeadlineNumber {
  companyAppears: number;
  competitorAppears: number;
  competitorName: string;
  n: number;
  /**
   * Data-grounded loss counts (no modeling, no assumptions) that quantify the
   * gap beyond "you're losing queries." Computed from the cached answers:
   * `lostRecommendations` = the number of (query × engine) cells where the
   * competitor was recommended and the client was absent — the hard count behind
   * the "not a one-off" story. `enginesCovered` = distinct engines actually
   * queried, so the count can be framed as spanning models, not one engine.
   */
  lostRecommendations: number;
  enginesCovered: number;
}

/**
 * A rubric violation found by `validateDraft` (src/rubric/validate.ts). `block`
 * severity means the draft must not render/export (a cross-cutting invariant was
 * broken); `warn` surfaces to the human reviewer without blocking. See RUBRIC.md.
 */
export interface Violation {
  /** Stable rule id from the rubric, e.g. "I1", "I3", "Q-thin-table". */
  rule: string;
  severity: "block" | "warn";
  /** The teaser surface the violation is about (headline, proof, table, …). */
  surface: string;
  message: string;
}

/** A fully-assembled draft teaser, ready for review/render. */
export interface TeaserDraft {
  prospectUrl: string;
  companyName: string;
  category: string;
  runDate: string;
  heroEngine: string;
  /**
   * The single rival the teaser names across every surface (headline, lead, proof
   * card, pattern table, headline count, leaderboard highlight). Selected once in
   * `selectFindings`; see `SelectionResult.heroCompetitor`.
   */
  heroCompetitor: string;
  headline: string;
  leadSentence: string;
  headlineNumber: HeadlineNumber;
  stakesLine: string;
  cta: string;
  lead: Finding;
  table: Finding[];
  /** Cached report + answers so the teaser is reproducible as engines drift. */
  report: ReportPayload;
  answers: AnswerRecord[];
  /**
   * Competitor name → aliases, carried from the resolved profile so the rubric
   * validator can match rivals ALIAS-aware (the platform's `report.competitors`
   * is names-only). Without this the validator's count/head-to-head checks are
   * strictly weaker than selection — the "independent backstop" would miss any
   * alias-referenced rival. Empty for regenerated drafts (aliases aren't stored).
   */
  competitorAliases?: Record<string, string[]>;
  status: "draft" | "approved" | "rejected" | "exported";
  /**
   * Rubric warnings surfaced by `validateDraft` at assembly time (quality issues
   * that don't block render — the reviewer decides). Block-severity violations
   * never reach here: they fail assembly with a reason instead. Optional so
   * pre-rubric drafts and external constructions stay valid.
   */
  warnings?: Violation[];
}
