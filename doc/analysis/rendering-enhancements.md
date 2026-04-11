# Analysis: Rendering Layer Enhancements

## Current State

The renderer (`render/mxgraph-renderer.ts`) converts `LayoutResult` + `GraphSpec` into draw.io XML. It handles groups, nodes, edges, routing, titles, and styling. The implementation is solid for the current scope.

This analysis identifies enhancements that would improve output quality, particularly for LLM-generated diagrams.

## Enhancement 1: Nested Group Support *(proposed)*

**Problem:** The current data model supports only one level of grouping. `GraphGroup.children` contains node IDs, but a group cannot contain other groups. Many real diagrams need nesting (e.g., "VPC > Subnet > Instance").

**Current limitation:**
- `GraphGroup` has `children: string[]` — node IDs only
- `dagreLayout` creates compound graph nodes for groups but doesn't support group-in-group
- `mxgraph-renderer` renders groups as flat containers

**What would change:**

*Types:*
```typescript
interface GraphGroup {
  id: string;
  label: string;
  children: string[];     // node IDs
  subgroups?: string[];   // group IDs (new)
  metadata?: Record<string, unknown>;
}
```

*Layout:* Both Dagre and ELK support compound graphs natively — a group node's parent can be another group node. The layout engine adapter would add parent edges for subgroups:

```typescript
// Current: only nodes get parents
g.setParent(node.id, node.group);

// New: groups can also have parents
if (group.parent) {
  g.setParent(group.id, group.parent);
}
```

*Rendering:* Each group cell's `parent` attribute would reference its parent group's cell ID instead of `"1"` (root). Coordinate translation would need to be recursive (subtract all ancestor positions).

**Effort:** Medium. Dagre handles the layout; the work is in recursive coordinate translation and group envelope fitting.

**Impact:** High for architecture diagrams (cloud infrastructure, network topologies). Low for simple flow diagrams.

## Enhancement 2: Edge Routing Quality *(proposed)*

**Problem:** The current renderer uses two edge styles — orthogonal (same-group) and curved (cross-group) — with basic exit/entry constraints based on relative node positions. This produces acceptable but not polished routing. Common issues:

- Edges routing through intermediate nodes
- Overlapping edge segments between the same node pair
- Sharp corners when orthogonal edges change direction

**Current approach** (`mxgraph-renderer.ts:168-182`):
- If `|dy| > |dx|`: vertical edge (exit bottom/top, enter top/bottom)
- Else: horizontal edge (exit right/left, enter left/right)
- Cross-group: `curved=1` with no constraint points

**Improvement options:**

1. **Port assignment.** Instead of always using center exit/entry, distribute edge endpoints along node edges to avoid overlap:
   ```
   Node has 3 outgoing edges → exit at y=0.25, 0.5, 0.75 instead of all at 0.5
   ```
   This requires counting edges per node side and assigning slots.

2. **Waypoint injection.** For edges that pass near intermediate nodes, add waypoints that route around them. This is essentially obstacle-aware routing.

3. **Leverage layout engine routing.** The layout engine already computes edge routing with waypoints (`LayoutEdge.points`). The renderer currently uses these points for cross-group edges but ignores them for same-group edges. Using the engine's routing everywhere would improve quality with no new algorithm needed. With ELK as the default engine (see `layout-engine-strategy.md`), this becomes even more valuable — ELK supports orthogonal and spline routing natively.

**Recommendation:** Option 3 (use engine routing more) is the best effort/impact tradeoff. Option 1 (port assignment) is a good follow-up.

## Enhancement 3: Theme System *(proposed)*

**Problem:** `RenderStyles` allows per-type customization, but there's no concept of a coherent *theme*. Users must manually specify colors for every node and edge type to achieve a consistent look.

**Proposed design:**

```typescript
interface DiagramTheme {
  name: string;
  palette: {
    primary: string;     // main node fill
    secondary: string;   // secondary node fill
    accent: string;      // highlight color
    background: string;  // canvas/group background
    text: string;        // default text color
    border: string;      // default stroke color
    edge: string;        // edge stroke color
  };
  font?: {
    family?: string;
    size?: number;
  };
}
```

A theme would generate a full `RenderStyles` object by mapping the palette to node/edge/group defaults:

```typescript
function themeToStyles(theme: DiagramTheme): RenderStyles {
  return {
    nodeStyles: {
      default: { fillColor: theme.palette.primary, fontColor: theme.palette.text, ... },
      external: { fillColor: theme.palette.secondary, ... },
    },
    edgeStyles: {
      default: { strokeColor: theme.palette.edge, ... },
    },
    groupStyles: {
      default: { fillColor: theme.palette.background, ... },
    },
  };
}
```

**Bundled themes:** `light` (current defaults), `dark`, `blueprint`, `minimal`.

**Effort:** Small — it's a mapping layer over existing `RenderStyles`.

**Impact:** Medium. Dramatically improves out-of-the-box output quality for LLM-generated diagrams, which rarely specify custom styles.

## Enhancement 4: Diagram Metadata in XML *(proposed)*

**Problem:** The rendered XML contains no metadata about how it was generated — no spec version, rule report, or generation timestamp. This makes debugging difficult.

**Proposed change:** Embed metadata as XML comments or custom attributes in the `mxfile`:

```xml
<mxfile>
  <!-- Generated by diagram-drc v0.1.3 -->
  <!-- Spec: 12 nodes, 8 edges, 3 groups -->
  <!-- DRC: 0 errors, 2 warnings, 1 info -->
  <diagram ...>
```

Or as `mxfile` attributes:

```xml
<mxfile generator="diagram-drc" version="0.1.3" drc-passed="true">
```

**Effort:** Trivial.

**Impact:** Low for end users, medium for debugging and traceability.

## Enhancement 5: SVG Output *(proposed)*

**Problem:** The only output format is draw.io XML. Some use cases (documentation, web embedding, CI previews) would benefit from direct SVG output.

**Scope:** A full SVG renderer is a significant effort. A pragmatic alternative is generating SVG via draw.io's headless export, but that introduces a runtime dependency.

**Minimal approach:** A simple SVG renderer that handles rectangles (nodes), lines (edges), and text (labels) — no curved edges or complex styling. Good enough for CI preview thumbnails.

**Effort:** Medium for minimal SVG, large for full-fidelity SVG.

**Recommendation:** Defer until there's a concrete use case. The draw.io XML format is the primary value proposition.

## Summary

| Enhancement | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| Theme system | Small | Medium | 1 — quick win for LLM output |
| Use layout engine routing everywhere | Small | Medium | 2 — improves edge quality |
| Nested groups | Medium | High (for infra diagrams) | 3 — unlocks new diagram types |
| Diagram metadata in XML | Trivial | Low | 4 — debugging aid |
| Port assignment for edges | Medium | Medium | 5 — polish |
| SVG output | Medium-Large | Low | Defer |
