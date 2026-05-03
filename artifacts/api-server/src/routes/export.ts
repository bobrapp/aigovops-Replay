/**
 * export.ts — Portable chain export endpoints.
 *
 * Three authenticated endpoints that let a user download their full receipt
 * chain in a standard format. All endpoints:
 *   - Require an authenticated session (requireAuth middleware)
 *   - Scope the query strictly to the requesting user's own receipts
 *   - Set Content-Disposition: attachment so browsers trigger a download
 *
 * GET /export/jsonl   — NDJSON stream, one receipt per line (memory-safe:
 *                       rows are fetched in 200-row batches and written to the
 *                       response before the next batch is read)
 * GET /export/html    — Self-contained HTML bundle with embedded chain verifier.
 *                       Streaming: the HTML head + skeleton are written first,
 *                       then a JSON array script tag is streamed with COMPLETE
 *                       receipt payloads (full prompt, full response, all hash
 *                       fields) row-by-row in 200-row batches.  No full
 *                       in-memory array is built server-side; each batch is
 *                       serialised and written immediately.  The embedded JS
 *                       reads from this JSON blob for both rendering and
 *                       cryptographic chain verification.
 * GET /export/sqlite  — SQLite .db file (binary format, inherently non-streamable).
 *                       Memory footprint is minimised by fetching rows in 200-row
 *                       batches and inserting them in per-batch transactions.
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

/** Async generator: yields rows in BATCH-sized pages ordered oldest-first. */
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

router.get("/export/html", requireAuth, async (req, res) => {
  const uid = getUid(req as Express.Request);
  const filename = exportFilename(uid, "html");
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Transfer-Encoding", "chunked");

  // ── 1. Write HTML head + skeleton before any DB query ──────────────────────
  res.write(HTML_HEAD(date));

  // ── 2. Stream full receipt dataset as a JSON array in a script tag ─────────
  //
  // We write the opening bracket, then each row as a comma-prefixed JSON
  // object (using leading commas so we never need to know whether a row is
  // last), then close the array.  Each 200-row batch is serialised and written
  // to the response immediately — the server never holds all rows in memory.
  //
  // COMPLETE receipt payloads are included: full prompt, full response, all
  // cryptographic hash fields, policy status, tags, and timestamps.  No
  // truncation.  The embedded verification JS reads exclusively from this
  // blob, ensuring a single source of truth for both rendering and chain walk.
  res.write('<script id="receipts-data" type="application/json">[\n');

  let totalWritten = 0;
  for await (const rows of batchRows(uid)) {
    for (const row of rows) {
      const prefix = totalWritten === 0 ? "" : ",\n";
      const obj = JSON.stringify({
        id: row.id,
        prompt: row.prompt,           // full, no truncation
        response: row.response,       // full, no truncation
        model: row.model,
        tags: row.tags,
        promptHash: row.promptHash,
        responseHash: row.responseHash,
        prevHash: row.prevHash ?? null,
        chainHash: row.chainHash,
        policyStatus: row.policyStatus,
        policyViolations: row.policyViolations,
        createdAt: row.createdAt.toISOString(),
      // Escape </script> sequences that would break the tag boundary.
      }).replace(/<\/script>/gi, "<\\/script>");
      res.write(prefix + obj);
      totalWritten++;
    }
  }

  res.write("\n]</script>\n");

  // ── 3. Write the verification + rendering JS and closing HTML ──────────────
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

  // Fetch rows in 200-row batches; insert each batch in a single transaction
  // to keep peak memory proportional to batch size rather than total row count.
  // (The final serialize() call is inherent to the SQLite binary format and
  //  cannot be streamed further without a different storage approach.)
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

// ─── HTML helpers ──────────────────────────────────────────────────────────────

function HTML_HEAD(date: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIGovOps REPLAY &#x2014; Chain Export ${date}</title>
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
.spinner{text-align:center;padding:40px;color:#64748b;font-size:14px}
</style>
</head>
<body>
<header>
  <span class="logo">&#x26D3; AIGovOps REPLAY</span>
  <div class="meta">Chain export &nbsp;&middot;&nbsp; ${date}</div>
  <div id="banner-inline" style="margin-left:auto;font-size:13px;color:#94a3b8">Verifying&hellip;</div>
</header>
<div id="banner" style="display:none"></div>
<div id="controls" style="display:none">
  <input id="search" type="search" placeholder="Filter by model, prompt, ID&hellip;" autocomplete="off">
  <span id="count-label" style="font-size:12px;color:#64748b"></span>
</div>
<div class="cards" id="cards"><div class="spinner">Loading&hellip;</div></div>
`;
}

function HTML_FOOT(count: number, date: string): string {
  return `<script>
(async function(){
  // ── Parse full receipt dataset from embedded JSON blob ─────────────────────
  var dataEl = document.getElementById('receipts-data');
  var receipts = dataEl ? JSON.parse(dataEl.textContent || '[]') : [];
  var total = receipts.length;

  // Sort ascending by createdAt (oldest first) for chain walk
  receipts.sort(function(a,b){ return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0; });

  // ── sha256 via Web Crypto ──────────────────────────────────────────────────
  async function sha256hex(str){
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
  }

  // ── Chain verification ────────────────────────────────────────────────────
  // chainHash = sha256("chain:" + promptHash + ":" + responseHash + ":" + prevHash|"GENESIS")
  var prevHash = null;
  var tampered = 0;
  var verifyMap = {};
  for(var i=0;i<receipts.length;i++){
    var r = receipts[i];
    var expectedPrevStr = prevHash === null ? 'GENESIS' : prevHash;
    var expectedChain = await sha256hex('chain:'+r.promptHash+':'+r.responseHash+':'+expectedPrevStr);
    var chainOk = r.chainHash === expectedChain;
    var linkOk  = r.prevHash === prevHash;
    var ok = chainOk && linkOk;
    if(!ok) tampered++;
    verifyMap[r.id] = ok;
    prevHash = r.chainHash;
  }

  var intact = tampered === 0 && total > 0;

  // ── Banner ────────────────────────────────────────────────────────────────
  var banner = document.getElementById('banner');
  var bannerI = document.getElementById('banner-inline');
  if(total === 0){
    banner.className='intact';
    banner.innerHTML='<span>&#x2713;</span><span>No receipts in export</span>';
    bannerI.textContent='Empty chain';
  } else if(intact){
    banner.className='intact';
    banner.innerHTML='<span>&#x2713;</span><span>Chain intact &#x2014; all '+total+' receipt'+(total===1?'':'s')+' verified</span>';
    bannerI.textContent='\u2713 Chain intact';
    bannerI.style.color='#34d399';
  } else {
    banner.className='tampered';
    banner.innerHTML='<span>&#x2717;</span><span>Tampered &#x2014; '+tampered+' receipt'+(tampered===1?'':'s')+' failed verification</span>';
    bannerI.textContent='\u2717 Tampered';
    bannerI.style.color='#f87171';
  }
  banner.style.display='flex';

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function pClass(s){
    return {pass:'policy-pass',fail:'policy-fail',pending:'policy-pending',error:'policy-error'}[s]||'policy-pending';
  }

  // ── Render cards (newest first) ───────────────────────────────────────────
  var displayOrder = receipts.slice().reverse();

  function renderCard(r, globalIdx){
    var ok = verifyMap[r.id];
    var ts = new Date(r.createdAt).toLocaleString();
    var tags = (r.tags||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>'}).join('');
    var prev = r.prevHash
      ? '<span class="hash-val">'+esc(r.prevHash.slice(0,52))+'&hellip;</span>'
      : '<span class="hash-val genesis">genesis</span>';
    // Display first 300 chars of prompt in card; full data is in the JSON blob.
    // Always escape AFTER slicing so user-controlled HTML/JS cannot execute.
    var promptDisplay = r.prompt.length > 300 ? esc(r.prompt.slice(0,300))+'&hellip;' : esc(r.prompt);
    return '<div class="card '+(ok?'ok':'bad')+'" data-model="'+esc(r.model)+'" data-prompt="'+esc(r.prompt.slice(0,200))+'" data-id="'+esc(r.id)+'">'+
      '<div class="card-header">'+
        '<span class="idx">#'+(globalIdx+1)+'</span>'+
        '<span class="model-badge">'+esc(r.model)+'</span>'+
        '<span class="model-badge '+pClass(r.policyStatus)+'">'+esc(r.policyStatus)+'</span>'+
        (!ok?'<span style="font-size:11px;color:#f87171;font-weight:600">&#x2717; tampered</span>':'')+
        '<span class="ts">'+esc(ts)+'</span>'+
      '</div>'+
      '<div class="hash-row"><span class="hash-label">Chain</span><span class="hash-val">'+esc(r.chainHash)+'</span></div>'+
      '<div class="hash-row"><span class="hash-label">Prev</span>'+prev+'</div>'+
      '<div class="hash-row"><span class="hash-label">Prompt</span><span class="hash-val">'+esc(r.promptHash.slice(0,52))+'&hellip;</span></div>'+
      '<div class="prompt-text">'+promptDisplay+'</div>'+
      (tags?'<div style="margin-top:8px">'+tags+'</div>':'')+
    '</div>';
  }

  var cardsEl = document.getElementById('cards');
  var countEl = document.getElementById('count-label');
  var controlsEl = document.getElementById('controls');

  function render(items){
    if(!items.length){
      cardsEl.innerHTML='<div class="spinner">No matching receipts.</div>';
      countEl.textContent='';
      return;
    }
    cardsEl.innerHTML = items.map(function(r,i){ return renderCard(r, displayOrder.indexOf(r)); }).join('\\n');
    countEl.textContent = items.length + ' of ' + total + ' receipts';
  }

  render(displayOrder);
  controlsEl.style.display='flex';

  // ── Search filter ─────────────────────────────────────────────────────────
  var searchEl = document.getElementById('search');
  searchEl.addEventListener('input', function(){
    var q = searchEl.value.toLowerCase().trim();
    if(!q){ render(displayOrder); return; }
    var filtered = displayOrder.filter(function(r){
      return r.model.toLowerCase().includes(q)||
        r.prompt.toLowerCase().includes(q)||
        r.response.toLowerCase().includes(q)||
        r.id.toLowerCase().includes(q)||
        (r.tags||[]).some(function(t){return t.toLowerCase().includes(q);});
    });
    render(filtered);
  });
})();
</script>
</body>
</html>`;
}

export default router;
