# Analysis: Public API Surface Review

## Current API

The public API (`src/index.ts`) exports 25 items: 11 types, 6 rule classes, 3 functions, and 5 style-related exports. For a v0.1.x package, this is a reasonable surface area.

This analysis reviews the API for gaps, inconsistencies, and ergonomic improvements — focused on what would make the library easier to use, particularly from LLM-generated code.

## Gap 1: No Single Entry Point for the Common Workflow *(proposed)*

**Problem:** The most common usage requires importing from multiple modules and chaining three calls:

```typescript
import { createEngine } from '@de-otio/diagram-drc';
import { elkEngine } from '@de-otio/diagram-drc/engines/elk';
import { renderMxGraph } from '@de-otio/diagram-drc/render';

const layout = await elkEngine().layout(spec);
const { layout: fixed } = createEngine().fix(layout, spec);
const xml = renderMxGraph(fixed, spec);
```

This is three imports, three calls, an `await`, and a destructure. For the 90% use case, a single function would be more ergonomic:

```typescript
import { generateDiagram } from '@de-otio/diagram-drc';

const { xml } = await generateDiagram(spec);
// or with options:
const { xml } = await generateDiagram(spec, {
  layout: { rankdir: 'LR', ranksep: 100 },
  render: { title: 'My Diagram' },
  rules: buildRuleDeck({ disable: ['rank-compaction'] }),
});
```

**Implementation:**

```typescript
export async function generateDiagram(
  spec: GraphSpec,
  options?: {
    engine?: LayoutEngine;
    layout?: LayoutOptions;
    render?: RenderOptions;
    rules?: LayoutRule[];
  }
): Promise<{ xml: string; report: DrcReport }> {
  const engine = options?.engine ?? elkEngine();
  const layout = await engine.layout(spec, options?.layout);
  const drc = createEngine({ rules: options?.rules });
  const { layout: fixed, report } = drc.fix(layout, spec);
  const xml = renderMxGraph(fixed, spec, options?.render);
  return { xml, report };
}
```

**Effort:** Small — it's a composition of existing functions.

**Impact:** High for adoption. LLMs and new users get a working diagram in one call. Power users still have the decomposed API.

## Gap 2: GraphSpec Validation *(proposed)*

**Problem:** Invalid `GraphSpec` objects fail silently or produce confusing errors deep in the pipeline. Common LLM mistakes:
- Missing required fields (`id`, `label`)
- Duplicate node IDs
- Edge referencing non-existent node
- Node referencing non-existent group

**Proposed solution:**

```typescript
export function validateSpec(spec: GraphSpec): ValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set<string>();

  for (const node of spec.nodes) {
    if (!node.id) errors.push('Node missing id');
    if (nodeIds.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
    if (node.group && !spec.groups?.some(g => g.id === node.group)) {
      errors.push(`Node ${node.id} references missing group: ${node.group}`);
    }
  }

  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} has missing source: ${edge.source}`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} has missing target: ${edge.target}`);
  }

  return { valid: errors.length === 0, errors };
}
```

**Relationship to LVS:** This is the spec-level validation that the LVS analysis (`lvs-validation.md`) identified as potentially separate from `LayoutRule`. A standalone `validateSpec()` function can run *before* layout, catching errors earlier and with clearer messages.

**Effort:** Small. Pure data validation.

**Impact:** High for LLM usage — fast feedback on malformed specs without running the full pipeline.

## Gap 3: Layout Options Not Fully Exposed *(proposed)*

**Problem:** `LayoutOptions` is exported as a type but several useful engine-specific options are not surfaced. With the pluggable `LayoutEngine` interface (see `layout-engine-strategy.md`), each engine adapter exposes its own options:

- **Dagre:** `align` (node alignment within ranks), `ranker` (ranking algorithm)
- **ELK:** `elk.algorithm` (layered, stress, tree, etc.), `elk.spacing.nodeNode`, `elk.edgeRouting` (polyline, orthogonal, splines)

**Proposed change:** `LayoutOptions` contains engine-agnostic options (rankdir, ranksep, nodesep, margins). Engine-specific options are passed to the engine adapter:

```typescript
const engine = elkEngine({
  algorithm: 'layered',
  edgeRouting: 'orthogonal',
});
const layout = await engine.layout(spec, { rankdir: 'LR', ranksep: 100 });
```

**Effort:** Small — each engine adapter maps common options and passes through engine-specific ones.

## Gap 4: Rule Configuration Discovery *(proposed)*

**Problem:** Each rule class accepts different options, but there's no way to discover available options programmatically. A user must read source code to know that `SpacingRule` accepts `{ minGap }` and `ContentMarginRule` accepts `{ top, left }`.

**Proposed solution:** Each rule class exposes a static description of its options:

```typescript
class SpacingRule implements LayoutRule {
  static readonly options = {
    minGap: { type: 'number', default: 20, description: 'Minimum gap between nodes in pixels' },
  } as const;
}
```

This enables tooling (IDE autocomplete, documentation generators, LLM prompt engineering) to discover configuration without reading source.

**Effort:** Small — add static fields to each rule class.

**Alternative:** TypeScript's type system already provides this via constructor parameter types. Adding runtime metadata is only valuable for dynamic tooling or documentation generation.

## Gap 5: Programmatic Access to Rule Defaults *(proposed)*

**Problem:** `builtinRules()` returns rule instances with default configuration. There's no way to get the default configuration values without reading source.

```typescript
// Current: you can get default-configured rules
const rules = builtinRules();

// Missing: you can't inspect what defaults they use
const spacingDefault = SpacingRule.defaults; // doesn't exist
```

**Lower priority.** This matters for configuration UIs or documentation, not for typical usage.

## Summary

| Gap | Effort | Impact | Priority |
|-----|--------|--------|----------|
| `generateDiagram()` convenience function | Small | High | 1 — biggest ergonomic win |
| `validateSpec()` function | Small | High | 2 — catches LLM errors early |
| Expose dagre layout options | Trivial | Low | 3 — power user feature |
| Rule configuration discovery | Small | Low | 4 — tooling support |
| Programmatic rule defaults | Small | Low | 5 — documentation support |
