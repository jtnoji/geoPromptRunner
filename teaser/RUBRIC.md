# Teaser Rubric

**The single standard every generated teaser must meet — and how it's enforced.**

The teaser is assembled by a pipeline (resolve → generate query set → audit → select findings → compose copy → render → human gate). For a while, each credibility bug was patched one function at a time: the pattern table repeated one engine (looked uni-engine); the H1 named one rival while the body named another; "is Whoop or Oura better?" head-to-heads that structurally exclude the client were printed as losses. Each patch lived in exactly one place, and one part of the system (query generation) actively **contradicted** another (selection).

This rubric replaces "patch the logic again" with **declare a rule once, enforce it everywhere.** It is realized as three layers:

| Layer | File | Role |
|---|---|---|
| **Config** | [`src/rubric/config.ts`](src/rubric/config.ts) | The tunable values (weights, caps, thresholds) both generators and the validator read. BUILD_PLAN §7 #8: *"config, not code."* |
| **Validator** | [`src/rubric/validate.ts`](src/rubric/validate.ts) | `validateDraft(draft) → Violation[]`. Mechanically checks every checkable rule against an assembled draft. Wired into `assembleDraft` — a blocking violation fails assembly before a human ever sees it. |
| **Spec** | this file | Why each rule exists and the failure mode it prevents. |

### Two severities

- **`block`** — a cross-cutting invariant (**I1–I5**) is broken. The pipeline refuses to assemble the draft and returns the reason. A false or incoherent teaser must never reach a human for a rubber-stamp.
- **`warn`** — a quality issue. It rides along on `draft.warnings` for the reviewer, who decides.

This mirrors the platform's **asymmetric-error policy** (BUILD_PLAN §4c): the expensive, reputation-damaging error is a *false claim of loss*, so the validator's count checks are **upper bounds** — a teaser may understate the loss (conservative) but must never overstate it.

---

## Cross-cutting invariants (block)

These are the spine. If any fails, the teaser does not ship.

### I1 · One hero rival, named everywhere
The teaser is *about one competitor.* The headline, lead sentence, proof card, headline number, chart highlight, and stakes all name the same `heroCompetitor`.
- **Failure mode:** the fort.cx bug — H1 said "…to Whoop" while the body argued Garmin. Reads as sloppy/automated; destroys trust.
- **Enforced:** selection picks `heroCompetitor` once ([`selectFindings.ts`](src/select/selectFindings.ts)); validator asserts the lead, headline number, and headline text all name it. *The pattern table may name a second rival as density backfill → **warn** (`I1-table`), not block.*

### I2 · Every number traces to a cached answer
No fabricated metrics, no traffic/revenue modeling. Every printed finding joins to a real verbatim answer, and every headline number is supported by the cached answers.
- **Failure mode:** a stale/edited headline claiming more absence than the data shows; a proof card quoting an answer that isn't in the run.
- **Enforced:** validator checks join integrity + sane bounds + **anti-overstatement upper bounds** (`companyAppears ≤` queries that actually name the client; `lostRecommendations ≤` client-absent cells; `n ≤` distinct answered queries; `enginesCovered ≤` distinct answered engines). Counts are re-derived independently from `draft.answers`.

### I3 · Nothing structurally rigged is printed
Every query shown is one the client *could* have won. A **closed head-to-head** — text naming ≥2 rivals while omitting the client ("is Whoop or Oura better?") — bounds the answer to the named brands, so the client can't be recommended. Its absence is a non-result.
- **Failure mode:** printing "is Whoop or Oura better? → Fort absent" — a savvy reader instantly sees the client was never in the running.
- **Enforced:** **prevented** at generation (a comparison names ≤ `MAX_COMPETITORS_PER_COMPARISON` rivals) **and backstopped** at selection (excluded from lead, table, and count) **and** re-checked by the validator on every printed query. Defense in depth via one shared knob.

### I4 · The pattern is cross-model
When the audit covered ≥2 engines, the printed findings should span ≥2 engines. "The same rival beats you on Perplexity *and* ChatGPT *and* Gemini" is far stronger than one engine three times.
- **Failure mode:** three rows all "Perplexity" → looks like a single-engine quirk, not a systemic problem.
- **Enforced:** selection prefers distinct engines (layered take); validator **warns** if multi-engine data yielded single-engine findings (data sometimes genuinely doesn't allow diversity, so this is a warn, not a block).

### I5 · Judge-only, human-gated
Only judge-detected reports are printable (regex lacks grade/accuracy). Every teaser is a `draft` until a human approves; the footer says so.
- **Failure mode:** shipping a regex-mode guess, or auto-sending without review.
- **Enforced:** `selectFindings` refuses non-judge reports; validator re-asserts `detection === "judge"`; render always stamps the draft disclaimer.

---

## Rule catalog

Legend — enforcement: **gen** (generation logic) · **select** (selection logic) · **validate** (`validateDraft`) · **render** (template/copy) · **config** (a knob in `config.ts`).

### A · Query instrument (what we ask)
Governs `ClaudeQuerySetGenerator` / `MockQuerySetGenerator`.

| # | Rule | Why | Enforced |
|---|---|---|---|
| A1 | 5 intent buckets, weighted toward category/comparison (`QUERY_WEIGHTS`) | Teasers land on category/comparison losses | gen, config |
| A2 | The client is named **only** in brand queries | Category/comparison test *unprompted* surfacing | gen |
| A3 | ≥ `MIN_CLIENT_FREE_COMPARISONS` comparison queries leave the client unnamed | Proves the client doesn't surface on its own | gen, config |
| A4 | Every comparison names ≥1 competitor | A comparison with no rival measures nothing | gen |
| **A5** | **A comparison names ≤ `MAX_COMPETITORS_PER_COMPARISON` (=1) competitors** | **Winnability — the source-side half of I3. Naming two rivals ("X or Y") makes the query unwinnable.** | **gen, select, validate, config** |
| A6 | Buyer voice; one question; no compound or leading asks | Reads as a real buyer, not a plant | gen (prompt) |

### B · Finding selection (what we feature)
Governs `selectFindings`.

| # | Rule | Why | Enforced |
|---|---|---|---|
| B1 | Judge-detection only | Regex lacks the verdict we print (I5) | select, validate |
| B2 | Only rows with a named competitor | The teaser names the rival | select |
| B3 | Exclude closed head-to-heads from lead/table/count | I3 backstop | select, validate |
| B4 | One `heroCompetitor` drives every surface | I1 | select, validate |
| B5 | Hero = strongest provable loss; elevate the category leader if it *also* loses at meaningful intent (`MEANINGFUL_INTENT`) | A dominant rival earns the H1; a leader we can only prove weakly does not | select, config |
| B6 | Lead = strongest demand-side loss on the hero rival (`LEAD_INTENT_PRIORITY`) | Category/problem beats a rival-named comparison as the hook | select, config |
| B7 | Table = `TABLE_SIZE` distinct queries, same rival, spread across engines (`INTENT_PRIORITY`) | Corroboration + I4 | select, config |
| B8 | Every finding joins to a verbatim answer | I2 | select, validate |
| B9 | Headline number counts only winnable queries; loss count is cell-grounded | I2 + I3 | select, validate |

### C · Copy & claims (the words)
Governs `copy.ts` / `proofCard.ts`.

| # | Rule | Why | Enforced |
|---|---|---|---|
| C1 | Deterministic templates, no LLM | Copy stays reviewable and consistent | render |
| C2 | Every number traces to cached answers; no modeling | I2 | render, validate |
| C3 | Prefer the grounded loss count; gap-framing fallback | Quantifies loss without fabrication | render |
| C4 | The competitor named in copy = `heroCompetitor` | I1 | render, validate |
| **C5** | **Temporal honesty — never imply real-time. The proof answer is framed "verbatim answer · captured {date}", not "live".** | **The answer is a cached run; "live" is a false real-time claim. A decorative pulse is OK only with an adjacent date.** | **render + `proofCard` test** |
| C6 | HTML-escape everything; safe markdown-bold conversion | No injection from answer text | render |

### D · Layout / structure

| # | Rule | Why | Enforced |
|---|---|---|---|
| D1 | Fixed section order (hero → proof → table → chart → why → stakes → CTA → footer) | Predictable, scannable one-pager | render |
| D2 | Conditional sections render only with data (why-section needs a site audit; chart needs a leaderboard; citations only if present) | Never show an empty module | render |
| D3 | The hero names the same rival as the body | I1, expressed in layout | render, validate |
| D4 | Reviewer `edits` overrides are applied at render | The human gate reaches the PDF | render |
| D5 | Draft disclaimer until approved | I5 | render |

### E · Provenance / lifecycle

| # | Rule | Why | Enforced |
|---|---|---|---|
| E1 | Cache report + answers on the draft | Reproducible as engines drift | pipeline |
| E2 | Regeneration reuses stored data, zero engine calls, current logic | Improvements reach past prospects for free | pipeline |
| E3 | Human review gate; status draft→approved/rejected→exported | I5 | pipeline / UI |
| E4 | Confirm gate on competitors before paying for an audit | A wrong competitor poisons everything | pipeline / UI |

---

## Adding a rule

When a new credibility issue is found, don't patch one function — add it to the rubric:

1. If it has a tunable value, add it to [`config.ts`](src/rubric/config.ts).
2. If it's checkable against an assembled draft, add an assertion to [`validate.ts`](src/rubric/validate.ts) — `block` for an invariant, `warn` for a quality issue — and a test in `tests/rubric.test.ts`.
3. If it constrains generation (queries) or selection (findings), enforce it there too, reading the same config knob (prevention + backstop, like A5/I3).
4. Document it here with its **failure mode** — the embarrassing teaser it prevents.
