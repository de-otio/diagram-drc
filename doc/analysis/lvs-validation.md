# Analysis: LVS — Layout vs. Schematic Validation

## Concept

In IC design, LVS checks whether the physical layout faithfully implements the intended schematic. The diagram-drc analog is checking whether a `LayoutResult` faithfully represents the `GraphSpec` that produced it. This catches *structural* errors — missing nodes, broken edges, wrong groupings — as opposed to the *spatial* quality issues that existing rules handle.

## Why This Matters

The current rule pipeline assumes the layout is structurally correct and only fixes geometry. But layout engines can silently drop elements (e.g., the Dagre adapter skips edges with missing endpoints — see `dagre-layout.ts:76-78`), and LLM-generated `GraphSpec`s may contain dangling references. Without LVS, a diagram can pass all DRC checks while missing half its content. This applies regardless of which layout engine is used (see `layout-engine-strategy.md` for the pluggable engine design).

## What to Validate

### 1. Node Coverage

Every node in `spec.nodes` must have a corresponding entry in `layout.nodes`.

```typescript
// Detection
const missing = spec.nodes.filter(n => !layout.nodes.has(n.id));
```

**Severity:** `error` — a missing node means the diagram is wrong, not just ugly.

**Fix strategy:** Cannot auto-fix. The layout engine must be re-invoked, or the violation must be surfaced to the caller.

### 2. Edge Coverage

Every edge in `spec.edges` must have a corresponding entry in `layout.edges` (matched by source+target or edge ID).

```typescript
const layoutEdgeSet = new Set(layout.edges.map(e => `${e.source}->${e.target}`));
const missing = spec.edges.filter(e => !layoutEdgeSet.has(`${e.source}->${e.target}`));
```

**Severity:** `error` — a missing edge changes the diagram's meaning.

**Fix strategy:** Cannot auto-fix layout, but can detect and report.

### 3. Group Membership

Every node with `node.group` set must be spatially contained within its group's bounding box in the layout.

```typescript
// For each node with node.group:
//   groupBounds = layout of group node
//   nodeBounds = layout of this node
//   assert node is geometrically inside group
```

**Severity:** `warning` — the relationship exists but isn't visually represented. Existing rules (BoundaryAffinityRule, GroupProximityRule) may fix this as a side effect, but LVS would catch it explicitly.

**Fix strategy:** Move the node inside its group, or expand the group to contain the node.

### 4. Dangling References

Edges that reference node IDs not present in `spec.nodes`, or nodes that reference group IDs not present in `spec.groups`.

```typescript
const nodeIds = new Set(spec.nodes.map(n => n.id));
const danglingEdges = spec.edges.filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target));
```

**Severity:** `error` — the spec itself is malformed.

**Fix strategy:** Cannot auto-fix. Report to the caller (or the LLM for correction).

### 5. Duplicate IDs

Multiple nodes, edges, or groups sharing the same ID.

**Severity:** `error` — undefined behavior in layout and rendering.

## Architecture Fit

LVS differs from existing rules in two ways:

1. **Some checks are unfixable.** A missing node can't be conjured by adjusting coordinates. The `fix()` method would return the layout unchanged and rely on the violation report.

2. **Some checks validate the spec, not the layout.** Dangling references and duplicate IDs are spec-level errors. The current `LayoutRule.check(layout, spec)` signature already accepts both, so these fit naturally.

### Where It Runs in the Pipeline

LVS should run **first**, before any geometric rules. If the layout is structurally wrong, spatial optimization is wasted work.

```
LVS → GroupProximity → CrossingMin → BoundaryAffinity → RankCompaction → Spacing → ContentMargin
```

This maps to a `phase: 'validation'` in the proposed phase system from the custom-rule-decks analysis, which defines an ordering of `validation < structure < spacing < cosmetic`.

## Implementation Sketch *(not yet implemented)*

```typescript
// Proposed new rule (not yet implemented)
export interface LvsOptions {
  checkNodeCoverage?: boolean;   // default: true
  checkEdgeCoverage?: boolean;   // default: true
  checkGroupContainment?: boolean; // default: true
  checkDanglingRefs?: boolean;   // default: true
  checkDuplicateIds?: boolean;   // default: true
}

export class LvsRule implements LayoutRule {
  id = 'lvs';
  description = 'Verify layout structurally matches the graph spec';
  severity: Severity = 'error';
  phase = 'validation' as const;  // Run before geometric rules (see custom-rule-decks.md)
  gate = true;                     // Halt pipeline on error (see engine-improvements.md)

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    // 1. Node coverage
    // 2. Edge coverage
    // 3. Group containment
    // 4. Dangling references
    // 5. Duplicate IDs
    return violations;
  }

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    // Only group containment is fixable — expand groups or move nodes.
    // All other violations are structural and cannot be auto-fixed.
    return layout;
  }
}
```

**Estimated effort:** Small. Pure data comparison, no geometry algorithms.

## Open Questions

1. **Should LVS block the rest of the pipeline?** Yes — this is addressed by the `gate` field proposed in `engine-improvements.md` and `custom-rule-decks.md`. With `gate: true`, the engine halts on error-severity violations from this rule. The LVS implementation above includes this field.

2. **Spec validation vs. layout validation.** Dangling refs and duplicate IDs are spec problems, not layout problems. Should these be a separate pre-flight check (`validateSpec()`) rather than a `LayoutRule`? A standalone function would be useful even before layout is computed.

3. **Edge ID matching.** Layout edges currently have `source` and `target` but the ID from `GraphEdge` is not carried through `dagreLayout()`. Edge coverage checking must match by source+target pairs, which fails for multigraphs (multiple edges between the same pair). Carrying edge IDs through the layout pipeline would fix this.
