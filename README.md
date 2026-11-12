# Super MOC Bros. // MOC Service Drive

NES-style 8-bit platformer for the MOC booth at NADA Show 2027. One self-contained HTML file: no build step, no dependencies, works offline.

- Live: https://play.mocproducts.app (Vercel, team `bnd-fish`; every push to `main` deploys)
- Booth copy: `CLAUDE_SANDBOX/SUPER_MOC_BROS/MOC-Service-Drive.html` on Andy's computer is the same file.
- Hidden from search engines (`X-Robots-Tag` in `vercel.json` and `robots.txt`) until launch is approved.
- The `.vercel.app` aliases redirect to the custom domain (`vercel.json`).

## Notes
- High scores are saved in the browser (localStorage), per device.
- Fonts: Press Start 2P and Silkscreen, both SIL Open Font License 1.1, rasterized into the file as bitmaps.
- Music, sound, sprites and the level are original. "SUPER MOC BROS." is a parody title; legal sign-off pending before public launch.

## Controls
NES layout: A jumps (tap for a short hop, hold to jump higher), B runs and sprays.

Keyboard: arrows/WASD move, X or Space = A (jump), Z or Shift = B (run/spray), Enter start/pause. Arcade encoders (MAME keys): Left Alt = A, Left Ctrl = B, 1 start. Gamepads: the right face button (A on Nintendo-style pads) jumps, the bottom face button (B) runs; Shift+G for button setup. Touch controls appear on phones and tablets.
