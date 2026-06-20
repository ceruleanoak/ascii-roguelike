# Glyph Canon & Migration Plan

Canon source: https://en.wikipedia.org/wiki/Phoenician_alphabet
Code home: `src/data/cipher.js` (`CIPHER`, `GREEK_TO_PHOENICIAN`, `phoenicianFor()`)

## The Canon

Non-physical character selections draw from a three-tier alphabet canon.
"Non-physical" = the glyph was picked arbitrarily or thematically. Glyphs
picked because they **look like the thing they represent** (a ψ-shaped
trident, a )-shaped bow) are shape-true and exempt — but the shape claim
must survive the test: *would a player sketch this glyph if asked to draw
the item?*

| Tier | Script | Role |
|------|--------|------|
| Surface | English letters + digits | Raw ingredients (existing two-tier rule, unchanged) |
| Canon cipher | Greek (U+0370–03FF) | **Reserved exclusively for Spectacles cipher puzzles.** No game content may use Greek codepoints. |
| Deep canon | Phoenician (U+10900–1091F) **dominant**; descendant alphabets secondary (Coptic, Samaritan, Hebrew, Aramaic, NKo, Cyrillic…) | Everything else non-physical: abstract item glyphs, enemy sigils, arbitrary markers |

**Equippable exception** (per design ruling): equippables may keep
non-canon Unicode when the glyph is a physical shape equivalent. Most
current equippable glyphs were *not* selected this way — those migrate
like everything else (see Wave 2).

## The True Unicode Chain (English → Greek → Phoenician)

Greek cipher layer is Beta Code (case-paired). Phoenician layer is
ancestry: caseless, many-to-one, no reverse. Implemented and verified in
`cipher.js`.

| Eng | Greek | Phoenician | Name (codepoint) | | Eng | Greek | Phoenician | Name (codepoint) |
|-----|-------|-----------|------------------|-|-----|-------|-----------|------------------|
| A a | Α α | 𐤀 | aleph U+10900 | | N n | Ν ν | 𐤍 | nun U+1090D |
| B b | Β β | 𐤁 | beth U+10901 | | O o | Ο ο | 𐤏 | ayin U+1090F |
| C c | Ξ ξ | 𐤎 | samekh U+1090E | | P p | Π π | 𐤐 | pe U+10910 |
| D d | Δ δ | 𐤃 | daleth U+10903 | | Q q | Θ θ | 𐤈 | teth U+10908 |
| E e | Ε ε | 𐤄 | he U+10904 | | R r | Ρ ρ | 𐤓 | resh U+10913 |
| F f | Φ φ | — | *Greek innovation* | | S s | Σ σ | 𐤔 | shin U+10914 |
| G g | Γ γ | 𐤂 | gimel U+10902 | | T t | Τ τ | 𐤕 | taw U+10915 |
| H h | Η η | 𐤇 | heth U+10907 | | U u | Υ υ | 𐤅 | waw U+10905 *(shared w/ V)* |
| I i | Ι ι | 𐤉 | yodh U+10909 *(shared w/ J)* | | V v | Ϝ ϝ | 𐤅 | waw U+10905 |
| J j | Ϳ ϳ | 𐤉 | yodh U+10909 | | W w | Ω ω | 𐤏 | ayin U+1090F *(shared w/ O)* |
| K k | Κ κ | 𐤊 | kaph U+1090A | | X x | Χ χ | — | *Greek innovation* |
| L l | Λ λ | 𐤋 | lamedh U+1090B | | Y y | Ψ ψ | — | *Greek innovation* |
| M m | Μ μ | 𐤌 | mem U+1090C | | Z z | Ζ ζ | 𐤆 | zayin U+10906 |

- **Canon-rootless letters**: F, X, Y (their Greek letters were invented, not inherited). Puzzle potential: the deep canon literally cannot express them.
- **Free canon glyphs**: 𐤑 tsade (U+10911) and 𐤒 qoph (U+10912) fathered nothing in the cipher — reserved for future content that should feel "older than the alphabet."

## Migration Waves

### Wave 1 — Evacuate Greek (required; breaks cipher integrity today)

Every Greek codepoint in game content collides with the cipher: the
reverse transform decodes it, and players who learn "Greek = ciphered
truth" get lied to. All current uses, with proposals (Coptic preserves
shape exactly, is BMP, and Unifont covers it):

| Now | Used by | Proposal | Why |
|-----|---------|----------|-----|
| Ω | Goo Dragon (`GooDragon.js`) + CheatMenu refs | Ⲱ U+2CB0 (Coptic) | shape-identical |
| ω | Goo Head (`GooHead.js`) | ⲱ U+2CB1 | shape-identical |
| Ω | Floating Boots (consumable, `items.js:1715`) | 𐤒 qoph (final); interim ⥣ U+2963 | abstract item → deep canon; also un-shares the enemy glyph |
| ω | Smoke Bomb (consumable, `items.js:1773`) | 𐤑 tsade (final); interim ⊚ U+229A | abstract item → deep canon; un-shares Goo Head glyph |
| Θ | TurtleHead enemy | Ⲑ U+2C90 | shape-identical |
| Ψ | Thick Staff (weapon; shape-true) | Ⲯ U+2CAE | shape preserved, exits Greek |
| ψ | Trident (weapon; shape-true) | ⲯ U+2CAF | shape preserved |
| λ | Chicken Leg (`GameConfig.js` background) | ⲗ U+2C97 | closest non-Greek shape |
| Λ | River up-flow tile (`RoomGenerator.js:2512`) | ∧ U+2227 | pure shape; logic-AND is identical |
| ϟ | Lightning Gun (weapon; bolt shape) | ↯ U+21AF | bolt shape preserved (incl. `bulletChar`) |
| Ϟ | Lightning Sword (weapon; bolt shape) | Ꞩ U+A7A8 | bolt-through-blade; no Ƨ Scythe clash |
| Ϡ | Stingray Mantle (armor; arguably shape-true) | ⚲ U+26B2 | body + tail silhouette |

Same-pass sync required: `recipes.js` results (lines 27, 77, 117, 192,
197), `ErrandSystem.js` reward pools, `letterTemplates.js:802`
(`blueZoneArmor`), CheatMenu spawn lists. π/ω in `Item.js`/`TrapSystem.js`
are math comments, not content — no action.

### Wave 2 — Equippables shape audit  ✅ IMPLEMENTED (except deferred items below)

**Implemented assignments:**

*Armor → Phoenician* (the worn deep-canon layer; letter meanings drive picks):
𐤇 heth/wall=Frost Robe · 𐤋 lamedh=Flame Robe · 𐤈 teth/wheel=Storm Robe ·
𐤐 pe=Emerald Robe · 𐤁 beth/house=Blood Robe · 𐤃 daleth/door=Shadow Robe ·
𐤒 qoph=Moss Cloak · 𐤕 taw/mark=Coral Crown. Consumables: 𐤑 tsade=Smoke Bomb;
Floating Boots=ѡ U+0461 (Cyrillic omega — boots silhouette per design ruling,
non-Greek).

*Weapons → Elder Futhark / shape symbols* (rune meanings in parens):
ᛉ algiz/spread=Shotgun · ᚷ gebo/crossed=Heavy Pistols · ᛁ isa/ice=Freeze Ray ·
⟰ launch=Rocket Launcher · ᛞ dagaz/day=Plasma Rifle · ᛋ sowilo/sun=Laser Cannon ·
ᚺ hagalaz/hail=Scatter Gun · ᚦ thurisaz/thorn=Venom Pistol · ᚾ naudiz/bind=Stun Gun ·
ᚱ raido/path=Ricochet Rifle · ᚲ kenaz/torch=Dragon Shotgun · ᛇ eihwaz/yew=Ice Bow ·
ᛒ berkano=Explosive Bow · ᛟ othala/home=Homing Bow · ᛏ tiwaz/arrow=Piercing Bow ·
ᛚ laguz/flow=Chain Bow · ᛃ jera/halves=Split Bow · ᛈ perthro=Burst Bow ·
ᛖ ehwaz/steed=Dragon Blade · ᚠ fehu=Lava Sword · ᛡ ior/serpent=Venom Blade ·
ᚢ uruz=Acid Blade · ᛠ ear=Chaos Blade · ᛜ ingwaz=Ice Hammer · ✺ burst=Exploding Mace ·
⏚ earth-ground=Earthquake Hammer · ᚨ ansuz/Æsir=Thunder Axe · ᛘ fang-fork=Vampire Dagger.

Font: NotoSansPhoenician-Regular.ttf shipped in `public/assets/fonts/`,
registered in `assets/styles.css` under family 'Unifont' with
`unicode-range: U+10900-1091F` — every canvas font stack resolves
Phoenician without touching fillText strings. Surrogate-pair audit came
back clean (no `char[0]`/`charAt` patterns).

**Legacy letter armors — ✅ IMPLEMENTED.** All 13 migrated to the
remaining free Phoenician letters (semantics = letter meaning → armor):
𐤀 aleph/ox=Fur Vest · 𐤅 waw/hook=Stitched Vest · 𐤌 mem/water=Slime Suit ·
𐤎 samekh/support=Reinforced Slime Suit · 𐤔 shin/tooth=Bone Armor ·
𐤊 kaph/palm=Padded Bone Armor · 𐤂 gimel/hide=Leather · 𐤄 he/cloth=Robe ·
𐤆 zayin/weapon=Warplate · 𐤏 ayin/eye=Ninja Garb · 𐤉 yodh/hand=Ember Cloak ·
𐤍 nun/cold=Ice Plate · 𐤓 resh/head=Dragon Scale. This consumes the entire
22-letter Phoenician alphabet (13 here + 9 from Wave 2). Audit confirmed
these letters collide with **enemy chars** (O L W K E A), **room exit
letters** (A R W O I), **wall/BG chars** (I 2), and **keyboard handlers**
(R 2 3) — but ALL such uses are in separate namespaces (`exitLetter===`,
`key===`, enemy/NPC char defs), so the migration touched data-refs ONLY:
items.js defs + loot pools, recipes.js results/chains, ErrandSystem pools,
one enemies.js `preferredItems`, one RoomGenerator armor pool. Zero
hardcoded armor-char logic exists. CheatMenu auto-discovers armors by
iterating ITEMS (no code change). Also fixed in the same pass:
RoomGenerator Wave-2 stragglers missed earlier (⌂→ᛉ, ⌘→ᛖ, ☼→ᚲ in the
discovery + rare_epic pools) and a pre-existing dead pool ref (`℧`→ᛜ Ice
Hammer, which never matched any item).

**Phoenician alphabet now fully allocated** — future deep-canon content
must use descendant scripts (Samaritan, Hebrew, Aramaic, Coptic, runic)
or revisit allocations.

**Still deferred** (each needs its own pass):
1. *Gem stave family* ⚝ ⚹ ⚶ ⚸ ⚘ ⚭ ⚳ + Force Wand — 7-glyph visual
   family; migrating piecemeal would break family recognition. Needs a
   coherent set (candidate: Armenian or Georgian letters, both
   canon-secondary). Phoenician is exhausted.
2. *RATIFY trio* — Ƨ Scythe, ¡ ⸘ ‖ bats, X Dual Pistols: awaiting ruling.
3. *Digit BG objects* — '0' Rock (KEPT per user: "rock is fine"),
   '2' Glittering Rock, '8' Bones still use digits (collide with the
   ingredient-letter namespace). The armor migration cleared the only
   HARD collision (armor '2' Stitched Vest vs BG '2' Glittering Rock —
   armor is now 𐤅). Remaining is the soft "BG-shouldn't-be-a-number"
   principle for Glittering Rock + Bones; glyph picks pending user (BG
   layer is world texture, conventionally ASCII, but '◣◢◥◤≡∩▓█◯⊞ⲗ' show
   it already admits symbols).

Original audit lists below for reference.

#### Original audit

First-pass classification of every weapon/armor glyph. **KEEP** =
shape-true exemption holds; **MIGRATE** = arbitrary/thematic, goes to
Phoenician (dominant) or a shape-true symbol; **RATIFY** = borderline,
needs the user's call.

- **KEEP (shape-true)**: ¬ ⌐ guns · ) ⟩ ⋙ bows · † ‡ § ⫯ ⚔ swords · ⛏ ⊦ ⊤ ⚒ axes/picks · ⊥ ⟘ hammers · ↑ ↟ ⇑ spears · / staff · ↾ dagger · ≋ ∿ ≀ ∽ ⤳ whips · ⊸ sling · ↩ boomerang · ○ flail · ⌁ stun baton · ⛓ Chain Mail · ⊙ Spectacles · ∆ Shark Mask · ߒ Fishing Pole, ߃ Vault Key (NKo, hook/key shapes — secondary script, allowed)
- **MIGRATE (arbitrary/thematic)**: ⌂ Shotgun · ※ Heavy Pistols · ❄ Freeze Ray · ⊕ Rocket Launcher · ═ Plasma Rifle · ◙ Laser Cannon · ⊞ Scatter Gun · ☣ Venom Pistol · ╬ Stun Gun · ⊿ Ricochet Rifle · ☼ Dragon Shotgun · ❅ Ice Bow · ⊛ Explosive Bow (also collides w/ Whirlwind Cape ⊛) · ◈ Homing Bow · ⇶ Piercing Bow · ≈ Chain Bow · ⋰ ⋯ Split/Burst Bow · ⌘ Dragon Blade · ╪ Lava Sword · ☤ Venom Blade · ♠ Acid Blade · ◇ Chaos Blade · ☃ Ice Hammer · ⬢ ⬡ Onyx/Crystal Maul · ◉ Exploding Mace · ▼ Earthquake Hammer · ⚯ Thunder Axe · ♣ Vampire Dagger · gem staves ⚝ ⚹ ⚶ ⚸ ⚘ ⚭ ⚳ · robes ℜ ℛ ℝ ℰ ℬ ℌ (decorated Latin = fake canon) · legacy armor letters V 2 O 3 A 4 L R W N E I K (two-tier rule violations) · ✿ Moss Cloak · ❖ Coral Crown
- **RATIFY**: Ƨ Scythe (reversed-S-as-blade?) · ¡ ⸘ ‖ bat family (¡ reads as a bat silhouette?) · X Dual Pistols (crossed guns = shape, but it's an English letter — surface tier owns letters)

Assignment worksheet: 22 Phoenician letters minus 𐤑/𐤒 (consumed in Wave 1)
leaves 20 free for the MIGRATE list; weapons within one family should
share a letter root only if slot UI can disambiguate — assignment happens
at ratification, not in this doc.

### Wave 3 — Enemies, background objects, UI, effects

Policy, not per-glyph (regenerate inventory with:
`grep -rhoP "[^\x00-\x7F]" src/ --include="*.js" | sort | uniq -c | sort -rn`):

1. **Enemies & background objects** stay printable-ASCII-first (existing
   encoding rule). Non-ASCII exceptions get triaged: shape-true stays
   (e.g. ☠), arbitrary sigils go Phoenician/secondary.
2. **Functional UI iconography** (▼ cursor, ∩ maze exit, ≡ wall, ⌛ timer,
   † tombstone, ◊ `NON_LETTER_COVER`, HP pips) is exempt — these are
   icons, not characters. ◊ must simply stay non-Greek (it does).
3. **Environment texture** (box drawing ─ ═ │ █ ░ ▁, arrows as motion)
   is exempt — drawing, not language.
4. **Rule violations to fold in**: emoji 💀 🧚 🔄 (no-emoji rule);
   alchemical 🜁 🜂 🜄 🜔 are SMP and font-risky — migrate or confirm
   rendering; stray scripts (Canadian syllabics ᒧ ᑕ ᐧ ᐤ, 𝑚, ²) triage
   into shape-true vs migrate.

## Prerequisites & Risks

- **Font (gates all Phoenician glyphs)**: base Unifont is BMP-only —
  U+10900 renders tofu today. Ship `Unifont Upper` or Noto Sans
  Phoenician as a runtime-fetched font in `public/assets/fonts/` (per
  CLAUDE.md rule), add `@font-face`, and extend the canvas font stacks.
  Until then, Wave 1 interim glyphs are all BMP on purpose. Fallback
  strategy if SMP stays painful: Samaritan block (U+0800–083F) is BMP,
  Unifont-covered, and visually close to Phoenician letterforms.
- **Astral-plane strings**: Phoenician chars are 2 UTF-16 units. Audit
  before Phase B: any `char[0]`, `.charAt(`, or `length === 1` logic on
  item/enemy char fields breaks. `for...of` iteration (already used in
  `spectaclesTransformString`) is safe; canvas `fillText` is safe.
- **No save-data migration needed**: the no-persistence rule means glyph
  swaps are free of compatibility debt — a deploy is the whole rollout.
- **Verification per wave**: `npm run build` (arch check), recipe
  round-trip in REST crafting, CheatMenu spawn of every renamed glyph,
  cipher roundtrip test in `cipher.js` consumers.
- **CLAUDE.md**: after ratification, replace the two-tier Character
  Encoding Rule with the three-tier canon table above (separate,
  user-approved edit).

## Status

- [x] Greek cipher = Beta Code English equivalence, case-paired (done, in `cipher.js`)
- [x] Greek → Phoenician true Unicode mapping + `phoenicianFor()` (done, verified)
- [x] **Wave 1 implemented** — all Greek evacuated from game content
      (12 files; Ϟ→Ꞩ and Ϡ→⚲ chosen at implementation, swappable on review).
      Floating Boots ⥣ and Smoke Bomb ⊚ are interim BMP glyphs — their
      final Phoenician homes (𐤒/𐤑) gate on the font decision.
- [ ] Font decision (Unifont Upper vs Noto vs Samaritan fallback)
- [ ] Wave 2 ratification of KEEP/MIGRATE/RATIFY lists → assignment worksheet
- [ ] Wave 3 triage
