/**
 * export.ts — Portable chain export endpoints.
 *
 * Three authenticated endpoints that let a user download their full receipt
 * chain in a standard format. All endpoints:
 *   - Require an authenticated session (requireAuth middleware)
 *   - Scope the query strictly to the requesting user's own receipts
 *   - Set Content-Disposition: attachment so browsers trigger a download
 *
 * GET /export/jsonl   — NDJSON stream, one receipt per line (batched, never
 *                       fully buffered: rows are fetched 200 at a time and
 *                       written to the response before the next batch is read)
 * GET /export/html    — Self-contained HTML bundle with embedded chain verifier.
 *                       Streamed: the head+CSS+JS is written first, then rows
 *                       are fetched and written as individual card elements in
 *                       200-row batches.  Verification JS reads from DOM data-*
 *                       attributes so no server-side JSON blob is needed.
 * GET /export/sqlite  — SQLite .db file compatible with sqlite3 CLI / DB Browser.
 *                       The SQLite file format is inherently non-streamable
 *                       (a fixed-layout binary format whose page map is written
 *                       at the beginning).  We minimise peak memory by fetching
 *                       rows in 200-row batches and inserting each batch inside
 *                       a single transaction before moving to the next batch.
 *                       The final serialize() call produces the binary buffer.
 */

import { Router, type IRouter } from "express";
import { db, interactionsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import Database from "better-sqlite3";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const BATCH = 200;

function getUid(req: Express.Request): string {
  return (req as Express.Request & { user: NonNullable<Express.Request["user"]> }).user.id;
}

function exportFilename(userId: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return `aigovops-chain-${safeId}-${date}.${ext}`;
}

// ─── shared batch iterator ─────────────────────────────────────────────────────

async function* batchRows(uid: string) {
  let offset = 0;
  while (true) {
    const rows = await db
      .select()
      .from(interactionsTable)
      .where(eq(interactionsTable.userId, uid))
      .orderBy(asc(interactionsTable.createdAt))
      .limit(BATCH)
      .offset(offset);
    if (rows.length === 0) break;
    yield rows;
    if (rows.length < BATCH) break;
    offset += BATCH;
  }
}

// ─── GET /export/jsonl ────────────────────────────────────────────────────────

router.get("/export/jsonl", requireAuth, async (req, res) => {
  const uid = getUid(req as Express.Request);
  const filename = exportFilename(uid, "jsonl");

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Transfer-Encoding", "chunked");

  for await (const rows of batchRows(uid)) {
    for (const row of rows) {
      const line = JSON.stringify({
        id: row.id,
        prompt: row.prompt,
        response: row.response,
        model: row.model,
        tags: row.tags,
        promptHash: row.promptHash,
        responseHash: row.responseHash,
        prevHash: row.prevHash ?? null,
        chainHash: row.chainHash,
        policyStatus: row.policyStatus,
        policyViolations: row.policyViolations,
        createdAt: row.createdAt.toISOString(),
      });
      res.write(line + "\n");
    }
  }

  res.end();
});

// ─── GET /export/html ─────────────────────────────────────────────────────────
//
// True streaming: the HTML head+CSS+JS is written before any DB query, then
// receipt cards are streamed 200 at a time as they are fetched.  Each card
// embeds all cryptographic fields in data-* attributes so the embedded
// verification script can re-derive chain hashes from the DOM without a
// server-side JSON blob.

router.get("/export/html", requireAuth, async (req, res) => {
  const uid = getUid(req as Express.Request);
  const filename = exportFilename(uid, "html");
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Transfer-Encoding", "chunked");

  // Write head + CSS + skeleton UI immediately (before any DB query).
  res.write(HTML_HEAD(date));

  // Stream receipt cards in batches.
  let totalWritten = 0;
  for await (const rows of batchRows(uid)) {
    for (const row of rows) {
      totalWritten++;
      res.write(htmlCard(row, totalWritten));
    }
  }

  // Write the footer with the count and the verification + search script.
  res.write(HTML_FOOT(totalWritten, date));
  res.end();
});

// ─── GET /export/sqlite ───────────────────────────────────────────────────────

router.get("/export/sqlite", requireAuth, async (req, res) => {
  const uid = getUid(req as Express.Request);
  const filename = exportFilename(uid, "db");

  const sqlDb = new Database(":memory:");

  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS interactions (
      id              TEXT PRIMARY KEY,
      prompt          TEXT NOT NULL,
      response        TEXT NOT NULL,
      model           TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      tags            TEXT NOT NULL DEFAULT '[]',
      prompt_hash     TEXT NOT NULL,
      response_hash   TEXT NOT NULL,
      prev_hash       TEXT,
      chain_hash      TEXT NOT NULL,
      policy_status   TEXT NOT NULL DEFAULT 'pending',
      policy_violations TEXT NOT NULL DEFAULT '[]',
      replay_count    INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_interactions_user_id    ON interactions (user_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions (created_at);
  `);

  const stmt = sqlDb.prepare(
    `INSERT INTO interactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  // Fetch and insert row-by-row in 200-row batches, each batch inside a
  // single transaction, to keep peak memory proportional to batch size rather
  // than total row count (save for the SQLite in-memory buffer itself, which
  // is inherent to the format and cannot be streamed).
  for await (const rows of batchRows(uid)) {
    const insertBatch = sqlDb.transaction(() => {
      for (const row of rows) {
        stmt.run(
          row.id,
          row.prompt,
          row.response,
          row.model,
          row.userId,
          JSON.stringify(row.tags),
          row.promptHash,
          row.responseHash,
          row.prevHash ?? null,
          row.chainHash,
          row.policyStatus,
          JSON.stringify(row.policyViolations),
          row.replayCount,
          row.createdAt.toISOString(),
        );
      }
    });
    insertBatch();
  }

  const buf = sqlDb.serialize();
  sqlDb.close();

  res.setHeader("Content-Type", "application/x-sqlite3");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buf.length));
  res.end(buf);
});

// ─── HTML streaming helpers ────────────────────────────────────────────────────

type RowLike = {
  id: string;
  model: string;
  policyStatus: string;
  promptHash: string;
  responseHash: string;
  prevHash: string | null;
  chainHash: string;
  prompt: string;
  tags: string[];
  createdAt: Date;
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Renders a single receipt card with all verification data in data-* attributes. */
function htmlCard(row: RowLike, idx: number): string {
  const ts = row.createdAt.toISOString();
  const tsDisplay = new Date(ts).toLocaleString();
  const prev = row.prevHash ?? "";
  const policyClass =
    { pass: "policy-pass", fail: "policy-fail", pending: "policy-pending", error: "policy-error" }[
      row.policyStatus
    ] ?? "policy-pending";
  const tags = row.tags
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join("");
  return `<div class="card pending"
  data-idx="${idx}"
  data-id="${esc(row.id)}"
  data-created-at="${esc(ts)}"
  data-chain-hash="${esc(row.chainHash)}"
  data-prev-hash="${esc(prev)}"
  data-prompt-hash="${esc(row.promptHash)}"
  data-response-hash="${esc(row.responseHash)}"
  data-model="${esc(row.model)}"
  data-prompt="${esc(row.prompt.slice(0, 200))}">
  <div class="card-header">
    <span class="idx">#${idx}</span>
    <span class="model-badge">${esc(row.model)}</span>
    <span class="model-badge ${policyClass}">${esc(row.policyStatus)}</span>
    <span class="verify-badge"></span>
    <span class="ts">${esc(tsDisplay)}</span>
  </div>
  <div class="hash-row"><span class="hash-label">Chain</span><span class="hash-val">${esc(row.chainHash)}</span></div>
  <div class="hash-row"><span class="hash-label">Prev</span>${
    row.prevHash
      ? `<span class="hash-val">${esc(row.prevHash.slice(0, 52))}…</span>`
      : `<span class="hash-val genesis">genesis</span>`
  }</div>
  <div class="hash-row"><span class="hash-label">Prompt</span><span class="hash-val">${esc(row.promptHash.slice(0, 52))}…</span></div>
  <div class="prompt-text">${esc(row.prompt.slice(0, 300))}</div>
  ${tags ? `<div style="margin-top:8px">${tags}</div>` : ""}
</div>`;
}

function HTML_HEAD(date: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIGovOps REPLAY — Chain Export ${date}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:0 0 48px}
header{background:#1e293b;border-bottom:1px solid #334155;padding:20px 24px;position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.logo{font-size:18px;font-weight:700;color:#60a5fa;letter-spacing:-.3px;white-space:nowrap}
.meta{font-size:12px;color:#94a3b8}
#banner{margin:20px 24px;padding:14px 18px;border-radius:10px;font-weight:600;font-size:15px;display:flex;align-items:center;gap:10px}
.intact{background:#064e3b;border:1px solid #065f46;color:#34d399}
.tampered{background:#450a0a;border:1px solid #7f1d1d;color:#f87171}
#controls{margin:0 24px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#search{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:8px 12px;border-radius:8px;font-size:13px;width:260px;outline:none}
#search:focus{border-color:#3b82f6}
.cards{display:grid;gap:12px;padding:0 24px}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;transition:border-color .15s}
.card:hover{border-color:#3b82f6}
.card.ok{border-left:3px solid #10b981}
.card.bad{border-left:3px solid #ef4444}
.card.pending{border-left:3px solid #334155}
.card-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.idx{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.model-badge{font-size:11px;padding:2px 8px;border-radius:99px;background:#1d4ed8;color:#bfdbfe;font-weight:600}
.policy-pass{background:#065f46;color:#6ee7b7}
.policy-fail{background:#7f1d1d;color:#fca5a5}
.policy-pending{background:#78350f;color:#fcd34d}
.policy-error{background:#4c1d95;color:#c4b5fd}
.ts{font-size:11px;color:#64748b;margin-left:auto}
.hash-row{display:flex;gap:8px;align-items:baseline;margin-bottom:4px;font-size:12px;overflow:hidden}
.hash-label{color:#64748b;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.05em;width:72px;flex-shrink:0}
.hash-val{font-family:'Courier New',monospace;color:#93c5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.genesis{color:#38bdf8;font-style:italic}
.prompt-text{font-size:13px;color:#cbd5e1;line-height:1.5;margin-top:10px;max-height:80px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.tag{display:inline-block;font-size:10px;padding:2px 7px;border-radius:99px;background:#1e3a5f;color:#7dd3fc;margin:2px 2px 0 0;border:1px solid #1d4ed8}
.verify-badge{font-size:10px;font-weight:700}
</style>
</head>
<body>
<header>
  <span class="logo">&#x26D3; AIGovOps REPLAY</span>
  <div class="meta">Chain export &nbsp;&middot;&nbsp; ${date}</div>
  <div id="banner-inline" style="margin-left:auto;font-size:13px;color:#94a3b8">Verifying&hellip;</div>
</header>
<div id="banner" style="display:none"></div>
<div id="controls">
  <input id="search" type="search" placeholder="Filter by model, prompt, ID&hellip;" autocomplete="off">
  <span id="count-label" style="font-size:12px;color:#64748b"></span>
</div>
<div class="cards" id="cards">
`;
}

function HTML_FOOT(count: number, date: string): string {
  return `</div><!-- /cards -->
<script>
(async function(){
  var cards = Array.from(document.querySelectorAll('.card[data-chain-hash]'));
  var total = ${count};

  // Sort ascending by createdAt (oldest first) for chain walk
  cards.sort(function(a,b){
    return a.dataset.createdAt < b.dataset.createdAt ? -1 : 1;
  });

  // sha256 via Web Crypto
  async function sha256hex(str){
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
  }

  // Walk chain in chronological order
  var prevHash = null;
  var tampered = 0;
  var verifyMap = {};
  for(var i=0;i<cards.length;i++){
    var c = cards[i];
    var ph = c.dataset.promptHash;
    var rh = c.dataset.responseHash;
    var storedPrev = c.dataset.prevHash || null;
    var storedChain = c.dataset.chainHash;
    var expectedPrevStr = prevHash === null ? 'GENESIS' : prevHash;
    var expectedChain = await sha256hex('chain:'+ph+':'+rh+':'+expectedPrevStr);
    var chainOk = storedChain === expectedChain;
    var linkOk  = storedPrev === prevHash;
    var ok = chainOk && linkOk;
    if(!ok) tampered++;
    verifyMap[c.dataset.id] = ok;
    prevHash = storedChain;
  }

  var intact = tampered === 0 && total > 0;

  // Update banner
  var banner = document.getElementById('banner');
  var bannerI = document.getElementById('banner-inline');
  if(total === 0){
    banner.className='intact';
    banner.innerHTML='<span>&#x2713;</span><span>No receipts in export</span>';
    bannerI.textContent='Empty chain';
  } else if(intact){
    banner.className='intact';
    banner.innerHTML='<span>&#x2713;</span><span>Chain intact &mdash; all '+total+' receipt'+(total===1?'':'s')+' verified</span>';
    bannerI.textContent='&#x2713; Chain intact';
    bannerI.style.color='#34d399';
  } else {
    banner.className='tampered';
    banner.innerHTML='<span>&#x2717;</span><span>Tampered &mdash; '+tampered+' receipt'+(tampered===1?'':'s')+' failed verification</span>';
    bannerI.textContent='&#x2717; Tampered';
    bannerI.style.color='#f87171';
  }
  banner.style.display='flex';

  // Apply ok/bad class to each card
  var allCards = Array.from(document.querySelectorAll('.card[data-id]'));
  allCards.forEach(function(c){
    var ok = verifyMap[c.dataset.id];
    c.classList.remove('pending');
    c.classList.add(ok ? 'ok' : 'bad');
    var badge = c.querySelector('.verify-badge');
    if(badge) badge.textContent = ok ? '' : '&#x2717; tampered';
    if(badge && !ok) badge.style.cssText='font-size:11px;color:#f87171;font-weight:600';
  });

  // Count label
  var countEl = document.getElementById('count-label');
  countEl.textContent = total + ' receipt' + (total===1?'':'s');

  // Search filter (hide/show cards by class)
  var searchEl = document.getElementById('search');
  searchEl.addEventListener('input', function(){
    var q = searchEl.value.toLowerCase().trim();
    var visible = 0;
    allCards.forEach(function(c){
      var match = !q ||
        (c.dataset.model||'').toLowerCase().includes(q) ||
        (c.dataset.prompt||'').toLowerCase().includes(q) ||
        (c.dataset.id||'').toLowerCase().includes(q);
      c.style.display = match ? '' : 'none';
      if(match) visible++;
    });
    countEl.textContent = (q ? visible + ' of ' : '') + total + ' receipt' + (total===1?'':'s');
  });
})();
</script>
</body>
</html>`;
}

export default router;
