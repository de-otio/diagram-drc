# Analysis: DFM — Design for Readability Rules

## Concept

In IC fabrication, DFM rules go beyond correctness to ensure a design is *manufacturable* — yield-friendly, robust to process variation. The diagram analog is **design for readability**: rules that ensure a structurally correct, well-laid-out diagram is also *legible* to a human reader.

The current rule set optimizes geometry (spacing, crossings, compaction). Readability rules would optimize the *communication* layer: text, color, size, and visual hierarchy.

## Proposed Rules *(none yet implemented)*

### 1. Label Legibility (`label-legibility`) *(proposed)*

**Problem:** Nodes with long labels rendered at small sizes produce unreadable text. LLMs frequently generate verbose labels like "Authentication Service Handler" inside 48×48px boxes.

**Check:**
- Estimate text width from label length (approximate: 7px per character at 12pt)
- Compare to node width minus padding (e.g., 10px each side)
- Violation if estimated text width > available width

```typescript
const charWidth = 7; // approximate px per char at default font
const padding = 20;  // left + right padding
const textWidth = node.label.length * charWidth;
const available = specNode.width - padding;
if (textWidth > available) { /* violation */ }
```

**Fix options:**
- Increase node width to fit label (preferred — preserves information)
- Report as unfixable if expansion would violate other constraints

**Severity:** `warning`

**Why this matters:** The most common LLM diagram failure mode is cramming too much text into small boxes, making the output useless despite being structurally correct.

### 2. Viewport Bounds (`viewport-bounds`) *(proposed)*

**Problem:** Diagrams that exceed a reasonable canvas size are hard to navigate in draw.io. A 50-node diagram sprawling across 10,000×10,000px defeats the purpose of visualization.

**Check:**
- Compare `layout.width` and `layout.height` against configurable maximums
- Default: 2000×2000px (roughly one large monitor at 100% zoom)

```typescript
if (layout.width > maxWidth || layout.height > maxHeight) { /* violation */ }
```

**Fix options:**
- Scale down coordinates proportionally (lossy — may create new spacing violations)
- Report as informational, suggesting the spec be split into sub-diagrams

**Severity:** `info`

### 3. Color Contrast (`color-contrast`) *(proposed)*

**Problem:** Custom styles may produce low-contrast combinations (light text on light background, or vice versa). This is an accessibility concern.

**Check:**
- For each node, compute the WCAG 2.1 contrast ratio between `fillColor` and `fontColor`
- Minimum ratio: 4.5:1 for normal text (WCAG AA)

```typescript
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg), l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
```

**Fix options:**
- Darken font color to meet minimum ratio
- Report only (style choices may be intentional)

**Severity:** `warning`

**Note:** This rule operates on `RenderStyles`, not on `LayoutResult` geometry. It stretches the `LayoutRule` interface slightly — the rule would need access to style configuration. See Architecture Fit below.

### 4. Minimum Node Size (`min-node-size`) *(proposed)*

**Problem:** Nodes below a minimum size are hard to see and interact with in draw.io. LLMs sometimes generate 10×10px nodes.

**Check:**
- Compare each node's width/height against minimums (default: 40×30px)

**Fix:**
- Expand undersized nodes, then re-run spacing to resolve new overlaps

**Severity:** `warning`

### 5. Edge Label Overlap (`edge-label-overlap`) *(proposed)*

**Problem:** Edge labels can overlap with nodes they pass near, making both unreadable.

**Check:**
- For each labeled edge, estimate label bounding box at the edge midpoint
- Check intersection with all node bounding boxes

**Fix:**
- Adjust edge waypoints to route around the overlapping node
- This is complex; may be better as check-only initially

**Severity:** `info`

## Architecture Fit

### The Style Problem

Most readability rules need information that isn't in `LayoutResult` or `GraphSpec`:
- **Label legibility** needs font metrics (or at least font size)
- **Color contrast** needs style colors
- **Edge label overlap** needs label dimensions

The current `LayoutRule.check(layout, spec)` signature doesn't include style information.

**Options:**

1. **Extend the signature.** Add an optional third parameter:
   ```typescript
   check(layout: LayoutResult, spec: GraphSpec, context?: RuleContext): Violation[];
   ```
   Where `RuleContext` includes styles, viewport config, etc. This is backwards-compatible (existing rules ignore it).

2. **Inject via constructor.** Rules that need styles receive them at construction time:
   ```typescript
   new ColorContrastRule({ styles: myStyles })
   ```
   This works today with no engine changes, but means the rule can't adapt to styles set after construction.

3. **Keep readability rules separate.** A `ReadabilityChecker` that runs after DRC, with its own interface. Cleaner separation but fragments the pipeline.

**Recommendation:** Option 2 for now (no engine changes needed), with option 1 as a future enhancement if more rules need runtime context.

### Rules That Can't Fix

Several readability rules can only detect, not fix (color contrast, viewport bounds). This is fine — the `LayoutRule` interface already supports this pattern (return the layout unchanged from `fix()`). The LVS analysis covers the same pattern.

## Prioritization

| Rule | Effort | Impact | Depends On |
|------|--------|--------|------------|
| Label legibility | Small | High | Nothing — biggest LLM pain point |
| Viewport bounds | Small | Medium | Nothing |
| Min node size | Small | Medium | Nothing |
| Color contrast | Medium | Low-Medium | Style access |
| Edge label overlap | Large | Low | Edge label geometry |

**Recommendation:** Start with label legibility — it's the highest-impact readability issue for LLM-generated diagrams and requires no architecture changes.
