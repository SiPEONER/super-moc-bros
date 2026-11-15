# Super MOC Bros. // MOC Service Drive

NES-style 8-bit platformer for the MOC booth at NADA Show 2027, with shared leaderboards.

- Live: https://play.mocproducts.app (Vercel, team `bnd-fish`; every push to `main` deploys)
- Booth copy: `CLAUDE_SANDBOX/SUPER_MOC_BROS/MOC-Service-Drive.html` on Andy's computer is the same `index.html`.
- Hidden from search engines (`X-Robots-Tag` in `vercel.json` and `robots.txt`) until launch is approved.
- The `.vercel.app` aliases redirect to the custom domain (`vercel.json`).

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | The whole game, one self-contained file (works offline). |
| `board/` | TV leaderboard page: `/board` shows the Booth board, `/board?b=online` the Online board. Refreshes every 5 s. F or a click for full screen. |
| `admin/` | Staff page: remove an entry or reset a board (needs `ADMIN_PASSWORD`). |
| `api/scores.js` | `GET /api/scores?board=booth\|online` returns the top 10 scores and top 10 times. `POST` adds a run. |
| `api/admin.js` | Staff actions: list, delete, reset. |
| `lib/lb.js` | Storage, checks and limits (Neon Postgres). |

## Leaderboards

Two boards, **Booth** (the cabinet) and **Online** (the website), each with **TOP SCORES** and **FASTEST TIMES**.
Run time is counted in game frames (60 per second) from the start of play to the flag. Deaths count against
it and pauses don't.

How the game picks a board:
- On the website it uses the Online board.
- Opened as a file, it looks for `booth-key.js` in the same folder. If that file sets `window.MOC_BOOTH_KEY`,
  it uses the Booth board on play.mocproducts.app. Offline runs queue up and upload when the connection is back.
  `booth-key.js` is private and must never be committed (it's in `.gitignore`).
- Otherwise it keeps scores on that device only, as before.

Checks on every score (`lib/lb.js`):
- Initials are 3 characters (A-Z or .).
- Score at most 270,000. That's every block, drop, power-up and enemy on all 7 possible lives, plus the best flag, time bonus and fireworks.
- Time at least 17.50 s. That's the start-to-flag distance at top speed with the Octane boost the whole way.
- The Online board takes at most 20 scores per device (IP) per 10 minutes. Only a one-way hash of the IP is stored.
- The Booth board needs the booth key and has no rate limit.

Rows are tagged with `VERCEL_ENV`, so Preview test scores never appear on the live boards.

### Environment variables (Vercel → Settings → Environment Variables)
- `DATABASE_URL`: added automatically when the Neon database is connected to the project.
- `BOOTH_KEY`: the secret the cabinet sends; the same value goes in `booth-key.js` next to the booth copy.
- `ADMIN_PASSWORD`: for the staff page.
- Optional: `MAX_SCORE`, `MIN_FRAMES` (game frames), `RATE_LIMIT` (per 10 minutes), `IP_SALT`.

Without `DATABASE_URL` the API answers 503 and the game quietly keeps scores on the device.

## Notes
- Fonts: Press Start 2P and Silkscreen, both SIL Open Font License 1.1, rasterized into the files as bitmaps.
- Music, sound, sprites and the level are original. "SUPER MOC BROS." is a parody title; legal sign-off pending before public launch.

## Controls
NES layout: A jumps (tap for a short hop, hold to jump higher), B runs and sprays.

Keyboard: arrows/WASD move, X or Space = A (jump), Z or Shift = B (run/spray), Enter start/pause. Arcade encoders (MAME keys): Left Alt = A, Left Ctrl = B, 1 start. Gamepads: the right face button (A on Nintendo-style pads) jumps, the bottom face button (B) runs; Shift+G for button setup. Touch controls appear on phones and tablets.
