# Analysis: Custom Rules and Rule Deck Overrides

## Problem Statement

As a user of the `diagram-drc` package, I want to:
1. Add my own custom design rules alongside the built-in ones
2. Override built-in rules with customized versions (different thresholds, behavior)
3. Compose entirely custom "rule decks" tailored to specific diagram types

## Current State

### What Already Works

The existing architecture is surprisingly extensible. The `LayoutRule` interface is public and straightforward:

```typescript
interface LayoutRule {
  id: string;
  description: string;
  severity: Severity;
  check(layout: LayoutResult, spec: GraphSpec): Violation[];
  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult;
}
```

A consumer can already:

- **Write a custom rule** by implementing `LayoutRule` as a plain object or class
- **Compose a custom rule set** by passing any `LayoutRule[]` to `createEngine({ rules: [...] })`
- **Reconfigure built-in rules** by instantiating them with custom options (e.g., `new SpacingRule({ minGap: 30 })`)
- **Control ordering** since rules execute in array order
- **Mix custom and built-in rules** freely in the same array
- **Add rules incrementally** via `engine.addRule(rule)` with method chaining

### Example: This Already Works Today

```typescript
import {
  createEngine, builtinRules, SpacingRule, ContentMarginRule,
  LayoutRule, LayoutResult, GraphSpec, Violation,
} from '@de-otio/diagram-drc';

// 1. Entirely custom rule
const maxNodesRule: LayoutRule = {
  id: 'max-nodes',
  description: 'Limit diagram complexity',
  severity: 'error',
  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    if (spec.nodes.length > 20) {
      return [{ ruleId: 'max-nodes', severity: 'error',
        message: `Too many nodes (${spec.nodes.length} > 20)`,
        affectedElements: [] }];
    }
    return [];
  },
  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    return layout; // can't fix complexity — just report it
  },
};

// 2. Override a built-in with different config
const tighterSpacing = new SpacingRule({ minGap: 10 });

// 3. Compose a custom rule deck
const engine = createEngine({
  rules: [
    tighterSpacing,            // replaced built-in spacing
    new ContentMarginRule({ top: 100 }),  // customized margin
    maxNodesRule,              // entirely new rule
    // deliberately omitting crossing-minimization and rank-compaction
  ],
});
```

## Gaps and Opportunities

Despite the solid foundation, several things make custom rules harder than they need to be.

### Gap 1: No Way to Selectively Override Built-in Rules *(proposed)*

To replace one built-in rule, a consumer must manually reconstruct the entire rule list. There's no `builtinRules()` variant that lets you swap one rule by ID while keeping the rest in their recommended order.

**Proposed solution — `buildRuleDeck()` helper:**

```typescript
import { buildRuleDeck } from '@de-otio/diagram-drc';

const engine = createEngine({
  rules: buildRuleDeck({
    // Override specific built-in rules by ID
    overrides: {
      'spacing': new SpacingRule({ minGap: 10 }),
    },
    // Disable specific rules by ID
    disable: ['rank-compaction'],
    // Append custom rules after built-ins
    append: [maxNodesRule],
    // Prepend custom rules before built-ins
    prepend: [earlyValidationRule],
  }),
});
```

This preserves the recommended built-in ordering while allowing surgical changes. The implementation is ~30 lines — filter `builtinRules()` by the disable/override lists, substitute overrides, then sandwich with prepend/append.

### Gap 2: No Named Rule Deck Presets *(proposed)*

Different diagram types benefit from different rule configurations. An architecture diagram needs different spacing than a sequence diagram. Currently, consumers must manually compose rules for each use case.

**Proposed solution — rule deck presets:**

```typescript
import { ruleDeck } from '@de-otio/diagram-drc';

// Presets ship with the package
const engine = createEngine({ rules: ruleDeck('architecture') });
const engine = createEngine({ rules: ruleDeck('sequence') });
const engine = createEngine({ rules: ruleDeck('network') });

// Or register your own presets
import { registerRuleDeck } from '@de-otio/diagram-drc';

registerRuleDeck('my-company-standard', () => [
  new SpacingRule({ minGap: 25 }),
  new ContentMarginRule({ top: 80, left: 20 }),
  myCustomRule,
]);

const engine = createEngine({ rules: ruleDeck('my-company-standard') });
```

This mirrors how IC DRC tools use "rule decks" or "tech files" per foundry process — the same concept applied to diagram types.

### Gap 3: No Rule Ordering Guidance in the API *(proposed)*

Rule execution order matters (crossing-minimization before rank-compaction, spacing before content-margin). Built-in rules rely on `builtinRules()` hardcoding the right order. Custom rules have no way to declare ordering preferences.

**Proposed solution — optional `phase` or `priority` field:**

```typescript
// Proposed extension to LayoutRule (not yet implemented)
// Current LayoutRule has: id, description, severity, check(), fix()
interface LayoutRule {
  id: string;
  description: string;
  severity: Severity;
  phase?: 'validation' | 'structure' | 'spacing' | 'cosmetic';  // proposed ordering hint
  check(layout: LayoutResult, spec: GraphSpec): Violation[];
  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult;
}
```

Phases provide soft ordering when rules are combined from multiple sources. The engine would sort by phase (validation < structure < spacing < cosmetic), then preserve insertion order within each phase. Rules without a phase slot in at the end. The `validation` phase is intended for structural checks like LVS (see `lvs-validation.md`) that should run before any geometric rules.

This is lighter than a full dependency graph and avoids the complexity of topological sorting.

### Gap 4: No Rule Validation or Conflict Detection *(proposed)*

If two rules fight (one pushes nodes apart, another pulls them together), the engine silently applies both with no feedback. Virtuoso DRC tools flag rule conflicts.

**Proposed solution — post-fix regression check:**

The engine already runs `check()` after `fix()`. This could be enhanced to detect *regressions* — violations introduced by a fix that weren't present before. A simple diff of before/after violation sets would surface conflicting rules.

```typescript
const { layout, report } = engine.fix(layout, spec);
// report.regressions: Violation[]  — new violations introduced by fixes
```

### Gap 5: No Documentation or Examples for Rule Authors *(proposed)*

The `LayoutRule` interface is exported but undocumented. A rule author needs to know:
- What invariants `check()` must maintain (no side effects, deterministic)
- What invariants `fix()` must maintain (return new LayoutResult, don't mutate input)
- How to properly clone layouts when modifying
- Common patterns (iterative repulsion, bounding box recalculation, group envelope updates)

**Proposed solution:** A "Writing Custom Rules" guide with a template rule implementation and guidance on the `cloneLayout` utility (currently a private function in `engine.ts`, not exported).

## Recommendations

Prioritized by impact and implementation effort:

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| 1 | `buildRuleDeck()` helper for selective override | Small | High — removes biggest friction point |
| 2 | Export `cloneLayout` utility for rule authors (currently private in `engine.ts`) | Trivial | Medium — essential for safe `fix()` implementations |
| 3 | "Writing Custom Rules" documentation + template | Small | Medium — reduces barrier to entry |
| 4 | Named rule deck presets | Medium | Medium — useful once diagram type ecosystem grows |
| 5 | Optional `phase` field for ordering hints | Small | Low-Medium — useful for multi-source rule composition |
| 6 | Post-fix regression detection | Medium | Low-Medium — diagnostic, not blocking |

### Suggested Implementation Order

**Phase 1 (minimal viable extensibility):**
- Implement `buildRuleDeck()` helper
- Export `cloneLayout` from public API
- Write rule authoring documentation with template

**Phase 2 (ecosystem support):**
- Add named rule deck presets for common diagram types
- Add optional `phase` field to `LayoutRule`

**Phase 3 (robustness):**
- Post-fix regression detection
- Rule conflict warnings
