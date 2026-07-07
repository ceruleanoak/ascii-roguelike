# Architecture Decision Records

Each ADR captures **one significant decision**: the situation that forced it, the choice
made, the alternatives weighed, and the consequences accepted. Based on Michael Nygard's
lightweight ADR.

The reasoning in an ADR — the priorities, constraints, taste, and trade-offs — is the one
artifact that is **pure human judgment**. AI can implement per an ADR, but it does not
author the *why*. When AI proposes a direction worth keeping, ratify it by writing the ADR
in your own words, then implement.

## When to write one

Write an ADR for a decision that is **hard to reverse, shapes the architecture, or that
future-you will ask "why on earth did I do it this way."** Examples: the simulation model,
how state is stored (here: the no-persistence rule), the entity representation, the
rendering approach, a committed dependency, a deliberate constraint.

Do **not** write one for routine, easily-reversed choices. A handful to a couple dozen over
the game's life is normal — if you're writing one a day, the bar is too low.

## Conventions

- **Naming:** `docs/adr/NNNN-short-title.md`, zero-padded, sequential. The number is permanent.
- **Immutable once Accepted.** Don't edit the substance — write a *new* ADR that supersedes
  the old one, and set the old one's status to `Superseded by ADR-XXXX`. The history of what
  you decided and then changed is part of the value.
- **Status lifecycle:** `Proposed` → `Accepted` → (later, maybe) `Superseded` / `Deprecated`.
- Copy [`template.md`](template.md) to start.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-unified-interior-manager.md) | Unified interior layer under a single InteriorManager | Accepted | 2026-06-26 |
