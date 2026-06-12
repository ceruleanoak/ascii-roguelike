# Pinboard

Open todos that aren't bugs. Bugs go in `known-bugs.md`; this is for follow-ups, deferred work, and ideas waiting for a session. Remove items when done (move nothing — just delete; git history is the archive).

Format: `| N | item — context/acceptance | added | status |` — numbers never reused.

| # | Item | Added | Status |
|---|------|-------|--------|
| 1 | **Smoke-test sfx-editor template UI** — `npm start` in `tools/sfx-editor/`, verify SAVE to a folder path (e.g. `enemy/magic/test`), LOAD, DEL, and that the dropdown groups by folder. CLI path is verified; GUI wiring was only code-reviewed. | 2026-06-10 | open |
| 2 | **Grow the SFX template library** — save sounds under category paths (`enemy/<class>/`, `ui/`, `pickup/`, `ambient/`). Goal: robust enough that new audio work starts from a template + `sfx vary`, not from scratch. | 2026-06-10 | open |
| 3 | **CLI lever control for `sfx vary`** — only `--factor` exists; add freq-range/pitch-sweep/lock flags mirroring the GUI randomizer levers. Wait until the basic vary loop has been used a few times. | 2026-06-10 | open |
| 4 | **Shared harness for `tools/debug/` repro scripts** — canvas stubs + tick-runner lib to cut per-repro boilerplate. Deferred until the pattern recurs a few more times (decided 2026-06-10). | 2026-06-10 | open |
| 5 | **Playtest Bat / Rubber Bat + knocked-away chain** — verify: windup glyph rotates CW from facing and blinks white at 270°; release sweep launches non-heavy enemies (mass < 2) along contact angle; heavy enemies take damage but don't fly; Rubber Bat (Goo+Stick) launches with no damage numbers; launched enemies bowl over others (velocity transfer chains, interrupts windups/charges). Tune first-pass values: Bat damage 1–2, Metal Bat (Bat+Metal) 1–4, launchForce 1100, chargeTime 2.4 (double-seconds), chain MIN_CHAIN_SPEED 80. | 2026-06-11 | open |
