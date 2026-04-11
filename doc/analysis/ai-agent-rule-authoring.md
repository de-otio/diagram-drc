# Analysis: AI-Agent Rule Authoring

## Problem Statement

The custom-rule-decks analysis assumes rule authors are developers writing TypeScript classes with geometric algorithms (iterative repulsion, barycenter heuristics, bounding box math). This is a poor fit for AI-agent authoring because:

1. **Geometric algorithms are error-prone for LLMs.** Writing correct `fix()` implementations requires spatial reasoning — the exact weakness that motivated the DRC approach in the first place.
2. **The surface area is too large.** A rule author must understand `LayoutResult`, `Map<string, LayoutNode>`, coordinate systems, cloning semantics, group membership, and edge routing — all to express something like "nodes shouldn't overlap."
3. **There's no feedback loop for rule correctness.** An LLM can generate a `check()` function, but testing whether it actually detects the right violations requires running it against layouts — a multi-step process with no guidance.

The design question: can we let an AI agent express *what* a rule should enforce without writing *how* to enforce it?

## How This Changes the Design

### The custom-rule-decks.md proposal is necessary but insufficient

That analysis proposes `buildRuleDeck()`, `cloneLayout` exports, and rule authoring docs. These are still valuable — they serve the power-user path. But they don't address the 90% case where a user tells their AI agent: "add a rule that keeps labels from overflowing their nodes."

The design needs a second, higher-level abstraction: **declarative constraint rules** that compile down to `LayoutRule` implementations.

### Proposed: Constraint-based rule primitives *(not yet implemented)*

Instead of implementing `check()` and `fix()`, an AI agent would compose rules from a library of geometric constraint primitives. Note: the `constraint()` factory proposed here is complementary to — not a replacement for — the `buildRuleDeck()` helper proposed in `custom-rule-decks.md`. `constraint()` creates new declarative rules from primitives; `buildRuleDeck()` selectively overrides built-in rules. Both produce `LayoutRule[]` and compose together:

```typescript
import { constraint, createEngine, builtinRules } from '@de-otio/diagram-drc';

const rules = [
  ...builtinRules(),

  // Declarative: what, not how
  constraint('min-gap', {
    between: 'nodes',
    measure: 'bbox-distance',
    min: 30,
    severity: 'warning',
  }),

  constraint('label-fits', {
    check: 'label-within-bounds',
    padding: 4,
    severity: 'error',
  }),

  constraint('max-diagram-size', {
    check: 'layout-bounds',
    maxWidth: 1200,
    maxHeight: 900,
    severity: 'warning',
  }),

  constraint('group-containment', {
    check: 'children-inside-parent',
    padding: 10,
    severity: 'error',
  }),
];

const engine = createEngine({ rules });
```

Each `constraint()` call returns a fully-formed `LayoutRule` with both `check()` and `fix()` implementations. The AI agent never writes geometric code — it selects a constraint type and provides parameters.

### Proposed primitive library

These primitives cover the most common layout quality concerns, informed by the patterns already present in the built-in rules and the proposals in design-for-readability.md:

| Primitive | Parameters | Check | Fix |
|-----------|-----------|-------|-----|
| `min-gap` | `between`, `measure`, `min` | Pairwise distance < min | Repulsion (reuse SpacingRule algorithm) |
| `max-gap` | `between`, `measure`, `max` | Pairwise distance > max | Attraction |
| `alignment` | `axis`, `tolerance`, `scope` | Nodes in same rank not aligned | Snap to nearest grid line |
| `label-within-bounds` | `padding` | Label text overflows node | Resize node to fit (spec-level suggestion) |
| `layout-bounds` | `maxWidth`, `maxHeight` | Diagram exceeds viewport | Scale or report (no auto-fix) |
| `children-inside-parent` | `padding` | Node outside its group bbox | Expand group or nudge node |
| `aspect-ratio` | `target`, `tolerance` | Diagram too tall/wide | Report only |
| `edge-length` | `max`, `min` | Edge too long or too short | Report only |
| `node-degree` | `maxEdges` | Node has too many connections | Report only (spec-level concern) |

Some constraints are check-only (no algorithmic fix possible) — and that's fine. The AI agent authoring the rule doesn't need to decide whether a fix is feasible; the primitive knows.

### How this relates to other analyses

**llm-feedback-loop.md** proposes structured suggestions on violations. Constraint primitives make this easier because each primitive *knows* what kind of fix applies — it can generate targeted suggestions without the rule author specifying them:

```typescript
// A min-gap constraint violation automatically suggests:
{
  ruleId: 'min-gap',
  message: 'Nodes "A" and "B" are 5px apart (min: 30px)',
  suggestion: 'Increase spacing between A and B, or reduce node sizes',
  fixes: [
    { type: 'move', target: 'A', dx: -12.5, dy: 0 },
    { type: 'move', target: 'B', dx: 12.5, dy: 0 },
  ],
}
```

**design-for-readability.md** proposes label legibility, viewport bounds, and contrast rules. These map directly to constraint primitives (`label-within-bounds`, `layout-bounds`). The readability rules become *instances* of the constraint system rather than separate implementations.

**api-surface-review.md** proposes `generateDiagram(spec, options)` as a single-call entry point. The constraint system extends this naturally:

```typescript
const xml = generateDiagram(spec, {
  rules: [
    ...builtinRules(),
    constraint('label-fits', { padding: 4, severity: 'error' }),
  ],
});
```

**incremental-drc.md** concludes that feedback quality matters more than performance. Constraint primitives reinforce this — since each primitive has a known fix strategy, it can produce high-quality feedback without the rule author having to think about it.

### Two-tier extensibility model

The design becomes two tiers, serving different audiences:

| | Declarative (AI-agent tier) | Imperative (power-user tier) |
|---|---|---|
| **Author** | AI agent or casual user | Developer with geometric expertise |
| **Interface** | `constraint()` with typed parameters | `LayoutRule` interface (class or object) |
| **Writes geometric code** | No | Yes |
| **Can express any rule** | No — limited to primitive library | Yes — arbitrary logic |
| **Fix implementation** | Automatic (from primitive) | Manual |
| **Feedback/suggestions** | Automatic (from primitive) | Manual (or none) |

Both tiers produce `LayoutRule` objects. They compose freely — a rule deck can mix declarative constraints and imperative rules in any order.

### The escape hatch matters

Some rules will never fit into primitives (crossing-minimization's barycenter heuristic, for example). The imperative tier must remain first-class. The key insight: **the AI agent doesn't need to author every possible rule — it needs to author the rules that matter for a specific user's diagrams**, which are usually parameter-driven variations of known patterns.

## Impact on custom-rule-decks.md recommendations

| Original proposal | Still needed? | Changes |
|---|---|---|
| `buildRuleDeck()` helper | Yes | Also accepts `constraint()` results |
| Named rule deck presets | Yes | Presets can be expressed as constraint configs (JSON-serializable) |
| Export `cloneLayout` (currently private in `engine.ts`) | Yes | For imperative tier |
| Rule authoring docs | Yes, but scope changes | Document constraint primitives first; imperative authoring becomes "advanced" |
| Optional `phase` field | Less important | Constraint primitives can set phase internally |
| Post-fix regression detection | Yes | Unchanged |

## New recommendation: JSON rule deck format *(not yet implemented)*

Since constraint rules are fully described by parameters, rule decks become serializable:

```json
{
  "name": "architecture-diagram",
  "extends": "builtin",
  "overrides": {
    "spacing": { "minGap": 30 }
  },
  "disable": ["rank-compaction"],
  "add": [
    { "type": "label-within-bounds", "padding": 4, "severity": "error" },
    { "type": "layout-bounds", "maxWidth": 1200, "severity": "warning" }
  ]
}
```

An AI agent can produce this JSON without importing anything. The package provides a `loadRuleDeck(config)` function that compiles it into `LayoutRule[]`. This also enables:

- Sharing rule decks as config files (committed to repos, published as packages)
- Rule deck validation (the schema is known; bad configs get clear errors)
- Non-TypeScript consumers (any language that can shell out to a CLI)

This directly addresses the user request: "minimize the code I must write by hand." With JSON rule decks, the answer is *zero code* for most use cases.

## Recommendations

Revised priority order, accounting for AI-agent authoring:

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Constraint primitive library (5-6 core primitives) | Medium | Very high — enables AI-agent rule authoring |
| 2 | JSON rule deck format + `loadRuleDeck()` | Small | Very high — zero-code rule configuration |
| 3 | `buildRuleDeck()` helper (from custom-rule-decks) | Small | High — ergonomic TypeScript composition |
| 4 | Export `cloneLayout` for imperative authors | Trivial | Medium |
| 5 | Rule authoring docs (constraint-first, imperative-advanced) | Small | Medium |
| 6 | Named presets as JSON configs | Small | Medium |
| 7 | Post-fix regression detection | Medium | Low-Medium |

### Suggested implementation order

**Phase 1 (AI-agent MVP):**
- Implement `constraint()` factory with `min-gap`, `label-within-bounds`, `layout-bounds`, and `children-inside-parent` primitives
- Implement `loadRuleDeck()` for JSON configs
- Export `cloneLayout`

**Phase 2 (ecosystem):**
- Add remaining primitives (`alignment`, `aspect-ratio`, `edge-length`, `node-degree`, `max-gap`)
- Named presets as shipped JSON configs
- `buildRuleDeck()` helper for TypeScript users

**Phase 3 (feedback integration):**
- Wire constraint primitives into the structured suggestion system (per llm-feedback-loop.md)
- Post-fix regression detection
