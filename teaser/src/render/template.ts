/**
 * Teaser one-pager template — fills the TeaserDraft into a single self-contained
 * HTML document, styled to the "Ledger" editorial design (imported from the
 * claude.ai/design project "GEO Teaser - Ledger"): warm cream paper, Newsreader
 * serif headlines + italic accents, Public Sans body.
 *
 * This is the merge of the working data-bound template with the design revamp:
 * a dramatic DARK hero (ember glow + lighter accent) that folds the headline
 * number into an in-hero stat band, and a dark CTA block — while keeping every
 * data binding, the heroCompetitor spine, the "why AI skips you" section, and the
 * reviewer `edits` overrides. Two accents by surface, matching the design: a
 * lighter ember (--accent) on the dark hero/CTA, the deeper rust (--rust) on the
 * light sections (proof mark, table, chart, stakes).
 *
 * Self-contained except for the Google Fonts <link> (Public Sans + Newsreader).
 * Print-clean for PDF export (the PDF is the deliverable; printBackground is on,
 * and the dark blocks force print-color-adjust so the ink survives the render).
 */

import type { Finding, TeaserDraft } from "../types/domain.ts";
import type { LeaderRow } from "../types/platform.ts";
import { ctaLine, engineLabel, proofCaption } from "./copy.ts";
import { renderProofCard } from "./proofCard.ts";
import { selectWhyGaps } from "../select/selectFindings.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Brand strings to look for in an answer — the full name and its TLD-stripped core. */
function mentionNeedles(companyName: string): string[] {
  const base = companyName.trim().toLowerCase();
  const core = base.replace(/\.(ai|io|com|co|app|net|org|dev|xyz)$/, "").trim();
  return [...new Set([base, core])].filter((s) => s.length >= 3);
}

/**
 * Turn the client's bare "appears in X%" into a concrete sentence: which query AI
 * actually named them in (the answer to "what *is* that 10%?"), or that AI named
 * them nowhere. Falls back to the plain count if no verbatim mention is found
 * (e.g. the judge matched an alias the raw answers don't spell out).
 */
function clientAppearanceLine(t: TeaserDraft): string {
  const { companyName: company } = t;
  const { companyAppears, n } = t.headlineNumber;
  if (companyAppears <= 0) {
    return `AI named ${company} in 0 of ${n} queries — every recommendation went to a competitor.`;
  }
  const needles = mentionNeedles(company).map((nd) => new RegExp(`\\b${escapeRegExp(nd)}\\b`));
  const hit = t.answers.find((a) => {
    const r = (a.response ?? "").toLowerCase();
    return needles.some((re) => re.test(r));
  });
  if (!hit) {
    return `AI named ${company} in just ${companyAppears} of ${n} buyer queries.`;
  }
  const where = `a buyer asked “${hit.prompt}” on ${engineLabel(hit.engine_name)}`;
  return companyAppears === 1
    ? `The one place AI named ${company}: when ${where}.`
    : `AI named ${company} in ${companyAppears} of ${n} queries — e.g. when ${where}.`;
}

export const FONTS =
  'https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&display=swap';

export const STYLE = `
  :root {
    --paper:#FBFAF7; --bg:#e7e5df; --ink:#1b1a17; --ink2:#36322c;
    --muted:#54504a; --muted2:#7a756c; --faint:#8a857c; --faintest:#a99a93;
    --rule:#E6E2D9; --rule2:#EFEBE2; --track:#ECE8DF; --neutral:#b3ada2;
    --rust:#B85C3C; --rust-line:rgba(184,92,60,.4);
    /* dark-surface palette (hero + CTA) */
    --dark:#16150f; --cream:#FBFAF7; --cream-2:#e7e2d8; --cream-muted:#bdb8ad;
    --cream-faint:#9a958b; --hairline:rgba(251,250,247,.14);
    --accent:#E8896A; --accent-tint:#E8A98E; --accent-glow:rgba(184,92,60,.30);
    --serif:'Newsreader',Georgia,serif; --sans:'Public Sans',-apple-system,Segoe UI,Roboto,sans-serif;
  }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; }
  body { background:var(--bg); font-family:var(--sans); color:var(--ink); }
  .wrap { min-height:100vh; padding:40px 24px; display:flex; justify-content:center; }
  .page { width:100%; max-width:760px; background:var(--paper); border-radius:5px; overflow:hidden; box-shadow:0 12px 50px rgba(27,26,23,.16); }
  .serif { font-family:var(--serif); }
  b, strong { font-weight:600; }
  @keyframes bf-ping { 0% { transform:scale(1); opacity:.55; } 70%,100% { transform:scale(2.6); opacity:0; } }

  /* ---- Hero (dark, dramatic) ---- */
  .hero { position:relative; overflow:hidden; padding:34px 52px 0; background: radial-gradient(120% 80% at 78% -10%, var(--accent-glow), transparent 60%), var(--dark); color:var(--cream); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .hero > * { position:relative; }
  .eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; font-weight:700; border-bottom:1px solid var(--hairline); padding-bottom:16px; display:flex; align-items:center; justify-content:space-between; }
  .eyebrow .live { display:inline-flex; align-items:center; gap:8px; color:var(--accent-tint); }
  .eyebrow .live .dot { position:relative; width:8px; height:8px; display:inline-flex; align-items:center; justify-content:center; }
  .eyebrow .live .dot::before { content:''; position:absolute; width:8px; height:8px; border-radius:50%; background:var(--accent); animation:bf-ping 1.8s cubic-bezier(0,0,.2,1) infinite; }
  .eyebrow .live .dot::after { content:''; width:8px; height:8px; border-radius:50%; background:var(--accent); }
  .eyebrow .date { color:var(--faint); }
  .hero h1 { font-family:var(--serif); font-weight:500; font-size:40px; line-height:1.1; letter-spacing:-.01em; margin:26px 0 16px; }
  .hero .lead { font-size:16.5px; line-height:1.6; color:var(--cream-muted); margin:0 0 30px; max-width:60ch; }
  .hero .lead .q { font-style:italic; font-family:var(--serif); color:var(--cream-2); }
  .hero .lead .rival { color:var(--accent); font-weight:600; border-bottom:1px solid var(--rust-line); }

  /* ---- In-hero stat band ---- */
  .hero-stat { display:flex; align-items:flex-end; gap:26px; border-top:1px solid var(--hairline); padding:26px 0 30px; }
  .hero-stat .fig { flex:0 0 auto; }
  .hero-stat .label { font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--faint); margin-bottom:10px; }
  .hero-stat .big { font-family:var(--serif); font-weight:500; font-size:104px; line-height:.82; color:var(--accent); font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
  .hero-stat .big .of { font-size:32px; color:#6f6a60; }
  .hero-stat .copy { flex:1; padding-bottom:14px; font-size:15px; line-height:1.55; color:#cfcabf; }
  .hero-stat .rival { display:flex; align-items:baseline; gap:9px; margin-top:8px; }
  .hero-stat .rival .num { font-family:var(--serif); font-size:30px; font-weight:500; color:var(--cream); }
  .hero-stat .rival .txt { font-size:14px; color:var(--cream-faint); }
  .hero-stat .rival .txt b { color:var(--accent); font-weight:600; }

  /* ---- Sections ---- */
  .section { padding:0 52px; }
  .section .kicker { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:30px 0 14px; }

  /* ---- Proof card ---- */
  .proof { margin:0; border:1px solid var(--rule); border-radius:10px; overflow:hidden; background:#fff; }
  .proof-chrome { display:flex; align-items:center; gap:9px; padding:12px 16px; border-bottom:1px solid var(--rule2); font-size:12px; }
  .proof-avatar { width:20px; height:20px; border-radius:6px; color:#fff; font-weight:800; font-size:11px; display:flex; align-items:center; justify-content:center; }
  .proof-engine { font-weight:700; }
  .proof-live { display:inline-flex; align-items:center; gap:5px; color:#2e8c66; font-weight:600; font-size:11px; }
  .proof-live .dot { width:6px; height:6px; border-radius:50%; background:#2e8c66; }
  .proof-date { margin-left:auto; color:var(--faintest); }
  .proof-body { padding:18px 20px; }
  .proof-q-label { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; margin-bottom:7px; }
  .proof-q-text { font-family:var(--serif); font-style:italic; font-size:17px; margin-bottom:14px; }
  .proof-answer { margin:0; padding:0 0 0 16px; border-left:2px solid var(--rule); color:var(--muted); font-size:14.5px; line-height:1.65; }
  mark.competitor { background:transparent; color:var(--rust); font-weight:600; border-bottom:1px solid var(--rust-line); }
  .proof-callout { display:flex; align-items:center; gap:11px; flex-wrap:wrap; margin-top:16px; padding-top:14px; border-top:1px solid var(--rule2); font-size:14px; }
  .proof-callout .x { width:18px; height:18px; border-radius:50%; border:1.5px solid var(--rust); color:var(--rust); font-weight:800; font-size:11px; display:flex; align-items:center; justify-content:center; }
  .proof-callout strong { color:var(--ink); font-weight:600; }
  .proof-callout .rec { margin-left:auto; color:var(--muted2); font-size:12.5px; }
  .proof-sources { margin-top:13px; font-size:12px; color:var(--faintest); }
  .caption { font-size:12.5px; color:var(--muted2); margin:11px 2px 0; }
  .caption.legend { margin:0 2px 14px; }

  /* ---- Pattern table ---- */
  table { width:100%; border-collapse:collapse; font-size:14px; }
  thead th { text-align:left; padding:11px 12px; border-bottom:1px solid var(--ink); font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted2); font-weight:700; }
  thead th:first-child { padding-left:0; }
  thead th:last-child { padding-right:0; }
  tbody td { padding:11px 12px; border-bottom:1px solid var(--rule2); }
  tbody td:first-child { padding-left:0; color:var(--muted2); }
  tbody td:last-child { padding-right:0; }
  tbody tr:last-child td { border-bottom:none; }
  td.query { color:var(--ink); }
  td.rec { font-weight:700; color:var(--ink); }
  td.miss { color:var(--rust); font-weight:700; white-space:nowrap; }
  td.miss .dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--rust); margin-right:7px; }

  /* ---- Visibility chart ---- */
  .chart { display:flex; flex-direction:column; gap:11px; }
  .vrow { display:grid; grid-template-columns:130px 1fr 46px; align-items:center; gap:12px; font-size:13px; }
  .vrow .name { font-weight:600; color:var(--muted2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .vrow .track { height:10px; background:var(--track); border-radius:999px; overflow:hidden; }
  .vrow .track > i { display:block; height:100%; background:var(--neutral); border-radius:999px; }
  .vrow .val { text-align:right; font-variant-numeric:tabular-nums; color:var(--muted2); font-weight:600; }
  .vrow.lead-rival .name { color:var(--ink2); }
  .vrow.lead-rival .track > i { background:var(--ink); }
  .vrow.lead-rival .val { color:var(--muted); }
  .vrow.is-client .name { color:var(--rust); font-weight:800; }
  .vrow.is-client .track > i { background:var(--rust); }
  .vrow.is-client .val { color:var(--rust); font-weight:700; }

  /* ---- Why (fixable gaps) ---- */
  .why { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:11px; }
  .why-row { display:flex; align-items:center; gap:11px; font-size:14px; }
  .why-marker { width:6px; height:6px; border-radius:50%; background:var(--rust); flex:none; }
  .why-label { color:var(--ink2); }
  .why-tag { margin-left:auto; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--muted2); white-space:nowrap; }

  /* ---- Stakes ---- */
  .stakes { margin:32px 52px 0; padding:0 0 0 20px; border-left:2px solid var(--rust); }
  .stakes p { margin:0; font-family:var(--serif); font-style:italic; font-size:18px; line-height:1.5; color:var(--ink2); }

  /* ---- CTA (dark) ---- */
  .cta { margin:34px 52px 0; background:var(--dark); border-radius:12px; padding:32px 32px 30px; color:var(--cream); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .cta .kicker { font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--faint); margin-bottom:12px; }
  .cta .head { font-family:var(--serif); font-weight:500; font-size:23px; line-height:1.3; letter-spacing:-.01em; max-width:40ch; margin-bottom:24px; }
  .cta .foot-row { display:flex; align-items:center; gap:20px; flex-wrap:wrap; border-top:1px solid var(--hairline); padding-top:22px; }
  .cta .btn { display:inline-flex; align-items:center; gap:9px; background:var(--cream); color:var(--dark); font-weight:700; padding:13px 22px; border-radius:8px; font-size:14px; white-space:nowrap; }
  .cta .btn .arrow { font-size:16px; }
  .cta .sub { font-size:13.5px; color:var(--cream-faint); line-height:1.5; }

  .foot { padding:20px 52px 32px; font-size:10.5px; color:var(--faintest); line-height:1.6; }

  @media print {
    body { background:#fff; }
    .wrap { padding:0; }
    .page { box-shadow:none; border-radius:0; max-width:none; }
  }
`;

function visibilityChart(leaderboard: LeaderRow[], topCompetitor: string | null): string {
  const rows = [...leaderboard].sort((a, b) => b.mention_rate - a.mention_rate).slice(0, 6);
  return `<div class="chart">${rows
    .map((r) => {
      const cls = r.is_client ? "is-client" : r.brand === topCompetitor ? "lead-rival" : "";
      const width = pct(r.mention_rate);
      return `
      <div class="vrow ${cls}">
        <span class="name">${escapeHtml(r.brand)}${r.is_client ? " (you)" : ""}</span>
        <span class="track"><i style="width:${width}%"></i></span>
        <span class="val">${width}%</span>
      </div>`;
    })
    .join("")}</div>`;
}

function patternRow(f: Finding, companyName: string): string {
  return `
    <tr>
      <td>${escapeHtml(engineLabel(f.engineName))}</td>
      <td class="query">${escapeHtml(f.verbatimQuery)}</td>
      <td class="rec">${escapeHtml(f.competitor)}</td>
      <td class="miss"><span class="dot"></span>absent</td>
    </tr>`;
}

/**
 * Reviewer copy overrides for the printable one-pager. Each field, when present,
 * replaces the draft's generated copy at render time — this is how human edits
 * made in the review UI actually reach the downloaded PDF/HTML. Mirrors the
 * `edited_fields` columns (TeaserEditedFields in web/lib/api.ts).
 */
export interface TeaserEdits {
  headline?: string;
  leadSentence?: string;
  stakesLine?: string;
  cta?: string;
}

function nonEmpty(s: string | undefined): string | null {
  return s && s.trim() ? s : null;
}

export function renderTeaserHtml(t: TeaserDraft, edits: TeaserEdits = {}): string {
  const h = t.headlineNumber;

  const headline = nonEmpty(edits.headline) ?? t.headline;
  const stakesLine = nonEmpty(edits.stakesLine) ?? t.stakesLine;
  const ctaText = nonEmpty(edits.cta) ?? nonEmpty(t.cta) ?? ctaLine(t.companyName);

  // A reviewer-edited lead sentence is rendered verbatim (escaped); otherwise we
  // build the default rich hero lead from the lead finding.
  const editedLead = nonEmpty(edits.leadSentence) ?? nonEmpty(t.leadSentence);
  const heroLead = editedLead
    ? escapeHtml(editedLead)
    : `Ask ${escapeHtml(engineLabel(t.lead.engineName))} ` +
      `<span class="q">“${escapeHtml(t.lead.verbatimQuery)}”</span> and it recommends ` +
      `<span class="rival">${escapeHtml(t.lead.competitor)}</span> — ` +
      `${escapeHtml(t.companyName)} is nowhere in the answer.`;

  const tableRows = [t.lead, ...t.table].map((f) => patternRow(f, t.companyName)).join("");

  // "Why AI skips you" — the top fixable on/off-site gaps behind the loss, from
  // the site-audit roadmap. Omitted when no site audit ran.
  const whyGaps = selectWhyGaps(t.report.site_audit);
  const whySection = whyGaps.length
    ? `
      <section class="section">
        <div class="kicker">Why AI leaves ${escapeHtml(t.companyName)} out</div>
        <ul class="why">
          ${whyGaps
            .map(
              (g) => `
          <li class="why-row">
            <span class="why-marker"></span>
            <span class="why-label">${escapeHtml(g.label)}</span>
            <span class="why-tag">${g.status === "fail" ? "missing" : "partial"} · ${escapeHtml(g.impact)} impact</span>
          </li>`,
            )
            .join("")}
        </ul>
        <p class="caption">The on-site &amp; off-site signals AI uses to decide who to recommend — the fixable gaps behind the pattern above.</p>
      </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t.companyName)} — AI visibility teaser</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${FONTS}" rel="stylesheet" />
  <style>${STYLE}</style>
</head>
<body>
  <div class="wrap">
    <main class="page">
      <header class="hero">
        <div class="eyebrow"><span class="live"><span class="dot"></span>AI Visibility Check · Prepared for ${escapeHtml(t.companyName)}</span><span class="date">${escapeHtml(t.runDate)}</span></div>
        <h1>${escapeHtml(headline)}</h1>
        <p class="lead">${heroLead}</p>
        <div class="hero-stat">
          <div class="fig">
            <div class="label">${escapeHtml(t.companyName)} appears in</div>
            <div class="big">${h.companyAppears} <span class="of">/ ${h.n}</span></div>
          </div>
          <div class="copy">
            high-intent buyer queries.
            <div class="rival"><span class="num">${h.competitorAppears}</span><span class="txt">name <b>${escapeHtml(h.competitorName)}</b> instead</span></div>
          </div>
        </div>
      </header>

      <section class="section">
        <div class="kicker">See it for yourself</div>
        ${renderProofCard(t.companyName, t.lead, t.runDate)}
        <p class="caption">${escapeHtml(proofCaption(t.companyName, t.lead))}</p>
      </section>

      <section class="section">
        <div class="kicker">Not a one-off — the same pattern repeats</div>
        <table>
          <thead>
            <tr><th>Engine</th><th>Buyer query</th><th>AI recommends</th><th>${escapeHtml(t.companyName)}</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </section>

      <section class="section">
        <div class="kicker">Who AI recommends in your category</div>
        <p class="caption legend">Each bar is the share of the ${h.n} buyer queries where AI named that brand in its answer.</p>
        ${visibilityChart(t.report.leaderboard, t.heroCompetitor)}
        <p class="caption">${escapeHtml(clientAppearanceLine(t))}</p>
      </section>
      ${whySection}

      <div class="stakes"><p>${escapeHtml(stakesLine)}</p></div>

      <div class="cta">
        <div class="kicker">The full picture</div>
        <div class="head">${escapeHtml(ctaText)}</div>
        <div class="foot-row">
          <span class="btn">Book 15 min <span class="arrow">→</span></span>
          <span class="sub">A 15-minute call to see exactly what a full audit would surface for ${escapeHtml(t.companyName)}.</span>
        </div>
      </div>

      <div class="foot">
        Findings derived from live AI-engine answers · hero engine: ${escapeHtml(engineLabel(t.heroEngine))} ·
        query set ${escapeHtml(t.report.query_set_version)} ·
        <strong>Draft — human review required before sending.</strong>
      </div>
    </main>
  </div>
</body>
</html>`;
}
