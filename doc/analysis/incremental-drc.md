# Analysis: Incremental DRC

## Concept

In IC tools like Virtuoso, incremental DRC re-checks only the region affected by an edit rather than re-running the full deck. For diagram-drc, the analog is an LLM refinement loop:

1. LLM generates a `GraphSpec`
2. Engine runs layout + DRC, reports violations
3. LLM adjusts the spec to fix violations
4. Engine re-checks — ideally only the affected area

This analysis evaluates whether incremental checking is worth the complexity at the current scale.

## Current Baseline

### Full-Check Performance

The existing pipeline:
- **Layout** (ELK or Dagre — see `layout-engine-strategy.md`): O(V + E) — typically < 10ms for graphs under 100 nodes
- **Rule checks:** Each rule is O(n²) at worst (spacing pairwise comparison)
- **Rule fixes:** Each rule is O(n²) with iteration (spacing repulsion loop)

For realistic diagram sizes (5–50 nodes, 5–30 edges), the full check+fix cycle completes in single-digit milliseconds. There is no performance problem to solve today.

### When Incremental Matters

Incremental DRC becomes valuable when:
- **Graphs exceed ~200 nodes** — O(n²) rules become noticeable
- **The feedback loop is latency-sensitive** — e.g., real-time editing in a UI
- **Rules are expensive** — e.g., a future rule that calls an external service

None of these conditions apply to the current use case (LLM batch generation of diagrams with < 100 nodes).

## Design If We Built It

### Change Tracking

The engine would need to know *what changed* between iterations:

```typescript
interface LayoutDelta {
  addedNodes: string[];
  removedNodes: string[];
  movedNodes: string[];   // nodes whose position changed
  addedEdges: string[];
  removedEdges: string[];
}

function diffLayouts(before: LayoutResult, after: LayoutResult): LayoutDelta;
```

### Affected Region

From a delta, compute the *dirty region* — the bounding box of all changed elements plus a margin (to catch spacing violations with neighbors):

```typescript
function dirtyRegion(delta: LayoutDelta, layout: LayoutResult, margin: number): BoundingBox;
```

### Rule Scoping

Each rule would declare whether it supports incremental checking:

```typescript
// Proposed extension to LayoutRule (not yet implemented)
interface LayoutRule {
  // ... existing fields (including phase and gate from custom-rule-decks.md) ...
  scope?: 'local' | 'global';
}
```

- **`local`** rules (spacing, content-margin) can be scoped to the dirty region — only check node pairs where at least one is in the region.
- **`global`** rules (crossing-minimization, group-proximity) depend on the full graph topology and must always run fully.

> **Note:** `scope` is orthogonal to the `phase` and `gate` fields proposed in `custom-rule-decks.md` and `engine-improvements.md`. `phase` controls execution order, `gate` controls pipeline halting, and `scope` controls spatial scoping for incremental checking. All three could coexist on `LayoutRule` if incremental DRC is implemented in the future.

### Caching

Rule results for unchanged regions would be cached and merged with fresh results:

```typescript
class IncrementalEngine {
  private cache: Map<string, RuleResult>;  // ruleId → last result

  checkIncremental(layout: LayoutResult, spec: GraphSpec, delta: LayoutDelta): DrcReport {
    for (const rule of this.rules) {
      if (rule.scope === 'local' && !regionOverlaps(delta, rule)) {
        // reuse cached result
      } else {
        // re-run rule
      }
    }
  }
}
```

## Analysis

### Benefits vs. Costs

| Factor | Assessment |
|--------|------------|
| Performance gain at current scale | Negligible — full DRC is < 10ms |
| Implementation complexity | High — change tracking, region computation, cache invalidation |
| Rule author burden | Medium — every rule must declare scope, handle partial inputs |
| Bug surface area | High — stale cache entries, region boundary edge cases |
| Maintenance cost | Ongoing — every new rule must be incremental-aware |

### What Breaks

Even "local" rules have non-obvious global effects:
- SpacingRule's iterative repulsion can cascade: fixing one overlap pushes a node into another. Scoping to a region misses the cascade.
- RankCompactionRule shifts all nodes below a gap — a local change affects global y-coordinates.
- BoundaryAffinityRule moves nodes within groups, potentially triggering spacing violations in unrelated areas.

These cascades mean "check only the dirty region" produces incorrect results unless the dirty region is expanded conservatively — which at small graph sizes means re-checking everything anyway.

## Recommendation

**Do not implement incremental DRC now.** The full pipeline is fast enough for the current use case, and the complexity cost is high relative to the benefit.

**Instead, invest in the LLM feedback loop itself:**

### Alternative: Structured Violation Feedback

Rather than making DRC faster, make the DRC *output* more useful to the LLM so it needs fewer iterations:

```typescript
// Proposed extensions to Violation (not yet implemented)
// Current Violation has: ruleId, severity, message, affectedElements, region
interface Violation {
  // ... existing fields ...
  suggestion?: string;       // "Move node 'auth' 30px right"
  suggestedChange?: {        // Machine-readable fix hint
    nodeId: string;
    property: 'x' | 'y' | 'width' | 'height';
    currentValue: number;
    suggestedValue: number;
  };
}
```

This gives the LLM precise, actionable feedback rather than generic violation messages. One well-guided iteration beats three incremental re-checks.

> **Note:** `llm-feedback-loop.md` independently arrives at the same conclusion and develops the structured suggestion design in detail. See that analysis for the full `SuggestedFix` interface and spec-level feedback proposals.

### When to Revisit

Revisit incremental DRC if:
- The library is used in a real-time editing context (not LLM batch generation)
- Graph sizes routinely exceed 200 nodes
- A rule is added that takes > 100ms to run
- Profiling shows DRC is the bottleneck (not layout or rendering)
