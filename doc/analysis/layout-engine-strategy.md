# Analysis: Layout Engine Strategy

## Problem Statement

The competitive landscape analysis identified several complementary tools, most notably ELK.js as a more capable layout engine and greadability.js as a readability scoring library. Should we integrate any of them? Should we replace Dagre?

## Current State

The project uses `@dagrejs/dagre` ^1.1.4 via a thin wrapper in `src/layout/dagre-layout.ts` (118 lines). The wrapper converts `GraphSpec` to Dagre's graphlib format, runs layout, and extracts a `LayoutResult`. The entire rule system (`LayoutRule.check()`, `LayoutRule.fix()`, the engine) is synchronous.

## Candidates Evaluated

### @dagrejs/dagre (current)

- **Status:** Actively maintained. v3.0.0 shipped March 2026 (ESM, build modernization, fixes). The project is on ^1.1.4 and should upgrade.
- **Strengths:** Synchronous API, small bundle (82 KB), compound graph support, well-understood behavior.
- **Weaknesses:** No built-in overlap removal, no spacing enforcement, polyline-only edge routing, known overlap bugs (#67, #158, #432).
- **Downloads:** 1.78M/week.

### elkjs (Eclipse Layout Kernel)

- **Status:** Actively maintained. v0.11.1 shipped March 2026. Used by Mermaid.js, React Flow, Svelte Flow.
- **Strengths:** Built-in overlap removal and spacing enforcement, orthogonal and spline edge routing, advanced compound graph hierarchy handling (3 modes), multiple algorithm choices (layered, stress, tree, radial, force).
- **Weaknesses:** Async-only API (`elk.layout()` returns a Promise), 1.6 MB bundle (20x Dagre), EPL-2.0 license (compatible but more restrictive than MIT).
- **Downloads:** 1.72M/week.

### webcola (cola.js)

- **Status:** Effectively abandoned. Last release May 2019. 112 open issues.
- **Verdict:** Not a viable alternative. Force-directed layout is the wrong paradigm for directed architecture diagrams. D3 dependencies are unnecessary baggage.

### greadability.js

- **Status:** Unmaintained. Last updated 2018, ~30 commits, not on npm.
- **What it does:** Computes 4 readability metrics (edge crossings, crossing angle, angular resolution min/deviation) as 0-1 scores.
- **Verdict:** The crossing-count logic already exists in `crossing-minimization.ts`. The additional metrics (crossing angle, angular resolution) are interesting but not worth taking a dependency on an abandoned, unpackaged library.

## Recommendation: Abstract the Layout Engine, Ship Both Dagre and ELK

### Why both engines

ELK.js is the stronger layout engine — better compound graph handling, built-in overlap removal, orthogonal and spline edge routing, and multiple algorithm choices. Its built-in quality features are an *upstream complement* to DRC, not a replacement: a better layout engine produces fewer violations for DRC to catch, but the rules still add value for domain-specific constraints, customization, structured feedback, and the LLM correction loop that no layout engine provides. Better input to the DRC pipeline means better output — that's the whole point.

ELK's async-only API requires the public API to become async, but this is acceptable: the project is still in beta and can make breaking changes. Designing the API as async-first now avoids a harder migration later.

Dagre remains valuable as a lightweight, zero-config default. Some users won't need ELK's power and will prefer the smaller bundle (82 KB vs 1.6 MB). Keeping both as options behind a shared interface is the right move.

### Design: LayoutEngine interface

The current `dagreLayout()` wrapper already returns a format-agnostic `LayoutResult`. Formalize this as an interface:

```typescript
export interface LayoutEngine {
  layout(spec: GraphSpec, options?: LayoutOptions): Promise<LayoutResult>;
}
```

The interface is async to accommodate ELK. The Dagre adapter wraps its synchronous result in a resolved Promise. The DRC engine awaits the layout step once at the top of the pipeline, then runs all rules synchronously on the resulting `LayoutResult`. Rules remain synchronous — there is no reason for geometric checks to be async.

```typescript
// Pipeline: async layout → sync DRC rules → sync render
const layout = await engine.layout(spec, options);
const { layout: fixed, report } = drc.fix(layout, spec);
const xml = renderMxGraph(fixed, spec);
```

### Shipping strategy

```typescript
import { createPipeline } from '@de-otio/diagram-drc';
const xml = await createPipeline().run(spec);  // ELK by default

// Lightweight alternative for bundle-sensitive or license-sensitive users
import { dagreEngine } from '@de-otio/diagram-drc/engines/dagre';
const xml = await createPipeline(dagreEngine()).run(spec);
```

- **ELK** is the default engine, bundled as a dependency. Better compound graph handling, built-in overlap removal, orthogonal and spline edge routing justify the default position despite the larger bundle (1.6 MB) and EPL-2.0 license.
- **Dagre** is the lightweight alternative for users who need a smaller bundle (82 KB) or prefer an MIT-only dependency tree.
- Both adapters implement the same `LayoutEngine` interface, so rules, rendering, and the DRC engine work identically regardless of which engine produced the layout.

### Upgrade Dagre in the meantime

Bump `@dagrejs/dagre` from ^1.1.4 to 3.0.0. The `@dagrejs` organization has been releasing steadily (v1.1.4 Aug 2024, v2.0.0 Nov 2025, v3.0.0 Mar 2026) and the latest version may address some overlap issues directly.

### greadability.js: Borrow ideas, don't take the dependency

The library is unmaintained and unpackaged. The most useful metric (edge crossing count) is already implemented in `crossing-minimization.ts`. The remaining metrics (crossing angle, angular resolution) could be implemented as additional DRC rules if there is demand:

```typescript
constraint('crossing-angle', {
  check: 'edge-crossing-angle',
  minAngle: 30,  // degrees
  severity: 'info',
})
```

This fits naturally into the constraint primitive system proposed in `ai-agent-rule-authoring.md` without requiring an external dependency.

## Action Items

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | Define `LayoutEngine` interface (async) | Small |
| 2 | Wrap current `dagreLayout` as a `LayoutEngine` adapter | Small |
| 3 | Make `DrcEngine` / pipeline top-level async to accept `LayoutEngine` | Medium |
| 4 | Upgrade `@dagrejs/dagre` to 3.0.0 | Small — needs testing |
| 5 | Add ELK engine adapter (`elkjs` as peer dependency) | Medium |
| 6 | Implement crossing-angle metric as a DRC rule | Small |
