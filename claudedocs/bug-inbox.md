# Bug Inbox

Quick-capture list for bugs noticed during play/dev, before they've been triaged. Add a line, no format friction.

**This is a work queue, not a ledger.** It holds only unaddressed bugs — nothing else. The moment a bug is handled, delete its line — don't mark it, don't archive it here. If it needs a durable record, that record lives in `known-bugs.md` (active, with category/P1-P2/source) or `resolved-bugs.md` (fixed) — this file must not duplicate either.

Just one bug per line below, plain text.

Crafting menu sometimes shows two selection lines in the ingredient-selection menu (surfaced during #217's repro trace, not explained by the ● shadowing fix). User's hypothesis: likely a missing guard around single-selection state in MenuSystem generally, not specific to what triggered it here — check for a general MenuSystem selection-index guard rather than assuming an ingredient-menu-specific cause. Needs a repro.