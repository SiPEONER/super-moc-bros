/* Shared leaderboards for Super MOC Bros.
   Two boards: "booth" (the NADA cabinet, which sends a secret booth key) and "online" (the website).
   Each board keeps two lists: top scores (highest first) and fastest clear times (lowest first, in game frames).
   Storage: Neon Postgres via DATABASE_URL. Rows are tagged with VERCEL_ENV so Preview tests never
   show up on the production boards. */
import { createHash, timingSafeEqual } from 'node:crypto';

/* Limits for the online board (the booth is trusted, but gets the same range checks).
   MAX_SCORE: the most one game can earn. Per life the level holds 11 ? blocks and a multi-drop block
   (19 drops), 24 loose drops, 27 bricks, 4 power-ups and 21 enemies, plus 19 drops in the secret warehouse:
   about 39,000 points with every enemy at 1,000. The 1UP jug is once per game and 100 drops give a life,
   so a game has at most 10 lives: 10 x 39,000 + flag 5,000 + time bonus 15,000 + fireworks 3,000 = about 413,000.
   MIN_FRAMES: the fastest route is the secret warehouse (v29). At top speed (2.5625 px per frame; the Octane
   boost isn't on that route) it takes 330 frames to reach the tall drum, 62 to cross the warehouse and 203 from
   the exit drum (cols 172-173, past the lift bay) to the flag, plus 55 frames of drum animations: 650 frames.
   The floor sits a little under that (10.50 s). The long way round can't beat 1,126 frames.
   MAX_FRAMES: 10 lives of 300 game seconds each, plus the death and lives-card time. */
export const LIMITS = {
  MAX_SCORE: Number(process.env.MAX_SCORE) || 420000,
  MIN_FRAMES: Number(process.env.MIN_FRAMES) || 630,
  MAX_FRAMES: 80000,
  RATE_N: Number(process.env.RATE_LIMIT) || 20,   // scores per device (IP) per window
  RATE_MINUTES: 10,
};
export const BOARDS = ['booth', 'online'];
const ENV = () => process.env.VERCEL_ENV || 'development';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lb_entries (
     id BIGSERIAL PRIMARY KEY, client_id TEXT NOT NULL, env TEXT NOT NULL, board TEXT NOT NULL,
     kind TEXT NOT NULL, initials TEXT NOT NULL, value INTEGER NOT NULL, ip_hash TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS lb_entries_client ON lb_entries (env, board, kind, client_id)`,
  `CREATE INDEX IF NOT EXISTS lb_entries_top ON lb_entries (env, board, kind, value)`,
  `CREATE TABLE IF NOT EXISTS lb_hits (ip_hash TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS lb_hits_ip ON lb_hits (ip_hash, at)`,
];

let query = null, ready = null;
/** Tests can inject their own query function: (sql, params) => Promise<rows[]> */
export function useQuery(fn) { query = fn; ready = null; }
async function db() {
  if (!query) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) return null;
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    query = (text, params) => sql.query(text, params);
  }
  if (!ready) ready = (async () => { for (const s of SCHEMA) await query(s, []); })().catch(e => { ready = null; throw e; });
  await ready;
  return query;
}

/* ---------- small helpers ---------- */
export function send(res, status, body, { cors = false } = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (cors) {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-max-age', '86400');
  }
  res.end(body === null ? '' : JSON.stringify(body));
}
export async function readBody(req) {
  let b = req.body;
  if (b === undefined) {
    b = await new Promise((resolve, reject) => {
      let data = ''; req.setEncoding('utf8');
      req.on('data', c => { data += c; if (data.length > 10000) reject(new Error('too large')); });
      req.on('end', () => resolve(data)); req.on('error', reject);
    });
  }
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { try { return b ? JSON.parse(b) : {}; } catch { return null; } }
  return b && typeof b === 'object' ? b : null;
}
const sha = s => createHash('sha256').update(String(s)).digest();
export function same(a, b) { return !!a && !!b && timingSafeEqual(sha(a), sha(b)); }
function ipHash(req) {
  const h = req.headers || {};
  const ip = String(h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || h['x-real-ip'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim();
  const salt = process.env.IP_SALT || process.env.ADMIN_PASSWORD || 'super-moc-bros';
  return sha(salt + '|' + ip).toString('hex').slice(0, 32);   // only a one-way hash is kept, never the address
}
const row = r => ({ i: r.i, v: Number(r.v), t: new Date(r.t).toISOString() });

/* ---------- reads ---------- */
export async function top(q, board, n = 10, withIds = false) {
  const cols = `${withIds ? 'id::text AS id, ' : ''}initials AS i, value AS v, created_at AS t`;
  const where = `env = $1 AND board = $2 AND kind = $3`;
  const [score, time] = await Promise.all([
    q(`SELECT ${cols} FROM lb_entries WHERE ${where} ORDER BY value DESC, created_at ASC, id ASC LIMIT ${n}`, [ENV(), board, 'score']),
    q(`SELECT ${cols} FROM lb_entries WHERE ${where} ORDER BY value ASC, created_at ASC, id ASC LIMIT ${n}`, [ENV(), board, 'time']),
  ]);
  const map = r => withIds ? { id: r.id, ...row(r) } : row(r);
  return { board, score: score.map(map), time: time.map(map) };
}

/* ---------- the two endpoints ---------- */
export async function scoresHandler(req, res) {
  const c = { cors: true };
  if (req.method === 'OPTIONS') return send(res, 204, null, c);
  const q = await db().catch(() => null);
  if (!q) return send(res, 503, { error: 'Leaderboard storage is not connected yet.' }, c);

  if (req.method === 'GET') {
    const board = new URL(req.url, 'http://x').searchParams.get('board');
    if (!BOARDS.includes(board)) return send(res, 400, { error: 'Unknown board.' }, c);
    return send(res, 200, await top(q, board), c);
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' }, c);

  const b = await readBody(req).catch(() => null);
  if (!b) return send(res, 400, { error: 'Bad request.' }, c);
  const { board, id, initials, score } = b;
  const frames = b.frames === null || b.frames === undefined ? null : b.frames;
  if (!BOARDS.includes(board)) return send(res, 400, { error: 'Unknown board.' }, c);
  if (board === 'booth') {
    if (!process.env.BOOTH_KEY) return send(res, 503, { error: 'Booth key is not set on the server.' }, c);
    if (!same(b.key, process.env.BOOTH_KEY)) return send(res, 403, { error: 'Wrong booth key.' }, c);
  }
  if (typeof id !== 'string' || !/^[a-z0-9]{6,40}$/.test(id)) return send(res, 400, { error: 'Bad id.' }, c);
  if (typeof initials !== 'string' || !/^[A-Z.]{3}$/.test(initials)) return send(res, 400, { error: 'Bad initials.' }, c);
  if (!Number.isInteger(score) || score < 0) return send(res, 400, { error: 'Bad score.' }, c);
  if (frames !== null && !Number.isInteger(frames)) return send(res, 400, { error: 'Bad time.' }, c);

  // the online checks: what the level can actually give, and how fast it can be run
  if (score > LIMITS.MAX_SCORE) return send(res, 422, { error: 'Score is higher than the level allows.' }, c);
  if (frames !== null && (frames < LIMITS.MIN_FRAMES || frames > LIMITS.MAX_FRAMES || score < 100))
    return send(res, 422, { error: 'Time is not possible for this level.' }, c);

  const ip = ipHash(req);
  if (board === 'online') {
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM lb_hits WHERE ip_hash = $1 AND at > now() - make_interval(mins => $2)`,
      [ip, LIMITS.RATE_MINUTES]);
    if (n >= LIMITS.RATE_N) return send(res, 429, { error: 'Too many scores from this device. Try again later.' }, c);
    await q(`INSERT INTO lb_hits (ip_hash) VALUES ($1)`, [ip]);
    if (Math.random() < 0.05) await q(`DELETE FROM lb_hits WHERE at < now() - interval '1 day'`, []);
  }
  const ins = `INSERT INTO lb_entries (client_id, env, board, kind, initials, value, ip_hash)
               VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`;
  await q(ins, [id, ENV(), board, 'score', initials, score, board === 'online' ? ip : null]);
  if (frames !== null) await q(ins, [id, ENV(), board, 'time', initials, frames, board === 'online' ? ip : null]);
  return send(res, 200, { ok: true, ...(await top(q, board)) }, c);
}

export async function adminHandler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const b = await readBody(req).catch(() => null);
  if (!b) return send(res, 400, { error: 'Bad request.' });
  if (!process.env.ADMIN_PASSWORD) return send(res, 503, { error: 'ADMIN_PASSWORD is not set on the server.' });
  if (!same(b.password, process.env.ADMIN_PASSWORD)) {
    await new Promise(r => setTimeout(r, 800));            // slow down guessing
    return send(res, 401, { error: 'Wrong password.' });
  }
  const q = await db().catch(() => null);
  if (!q) return send(res, 503, { error: 'Leaderboard storage is not connected yet.' });
  const board = b.board;
  if (b.action !== 'list' && !BOARDS.includes(board)) return send(res, 400, { error: 'Unknown board.' });
  if (b.action === 'delete') {
    if (!/^\d+$/.test(String(b.id))) return send(res, 400, { error: 'Bad id.' });
    await q(`DELETE FROM lb_entries WHERE env = $1 AND board = $2 AND id = $3`, [ENV(), board, String(b.id)]);
  } else if (b.action === 'reset') {
    if (b.kind === 'score' || b.kind === 'time')
      await q(`DELETE FROM lb_entries WHERE env = $1 AND board = $2 AND kind = $3`, [ENV(), board, b.kind]);
    else await q(`DELETE FROM lb_entries WHERE env = $1 AND board = $2`, [ENV(), board]);
  } else if (b.action !== 'list') return send(res, 400, { error: 'Unknown action.' });
  const boards = {};
  for (const bd of BOARDS) boards[bd] = await top(q, bd, 25, true);
  return send(res, 200, { ok: true, env: ENV(), limits: LIMITS, boards });
}
