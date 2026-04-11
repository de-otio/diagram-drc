# Analysis: LLM Feedback Loop Integration

## Context

The design philosophy document identifies the core insight: diagram-drc decomposes diagram generation into what LLMs do well (structure) and what algorithms do well (geometry). But the current API treats this as a one-shot pipeline: spec in, XML out. The design philosophy also proposes "incremental DRC" for iterative refinement.

The incremental DRC analysis (`incremental-drc.md`) concluded that incremental *checking* isn't worth the complexity at current scale, and independently recommended investing in structured feedback instead — the same conclusion this analysis reaches. This document develops that idea in full.

> **Note on async pipeline:** Per `layout-engine-strategy.md`, the layout step is now async (ELK.js is the default engine). The feedback loop described here wraps the full pipeline (`await generateDiagram()` or `await engine.layout()` + sync DRC), so all examples should be read as running inside an async context.

## The Feedback Problem

When DRC reports violations, the LLM needs to understand:
1. **What** is wrong (current: violation message)
2. **Where** it is wrong (current: `affectedElements` IDs, optional `region`)
3. **How to fix it** (current: nothing — the LLM must infer)
4. **What changed after auto-fix** (current: nothing — opaque fixed layout)

Items 3 and 4 are the gaps. An LLM receiving "Nodes 'auth' and 'db' are too close (gap: 5px, minimum: 20px)" has no actionable path forward. It doesn't know which node to move, in which direction, or by how much.

## Proposed: Structured Fix Suggestions *(not yet implemented)*

### In Violations

Extend `Violation` with optional machine-readable suggestions:

```typescript
// Proposed extensions to Violation (not yet implemented)
// Current Violation has: ruleId, severity, message, affectedElements, region
interface Violation {
  // ... existing fields ...
  suggestion?: string;  // Human-readable: "Increase width of node 'auth' to 120px"
  fixes?: SuggestedFix[];  // Machine-readable
}

// Proposed new interface (not yet implemented)
interface SuggestedFix {
  type: 'move' | 'resize' | 'reorder' | 'remove' | 'regroup';
  target: string;      // Element ID
  changes: Record<string, number | string>;
  // e.g., { x: 150, y: 200 } for move
  // e.g., { width: 120 } for resize
}
```

**Example output for an LLM:**

```json
{
  "ruleId": "spacing",
  "message": "Nodes 'auth' and 'db' are too close (gap: 5px, minimum: 20px)",
  "affectedElements": ["auth", "db"],
  "suggestion": "Move 'db' 15px to the right",
  "fixes": [
    { "type": "move", "target": "db", "changes": { "x": 215 } }
  ]
}
```

The LLM can use `suggestion` for natural-language understanding and `fixes` for precise spec adjustments.

### In Fix Reports *(not yet implemented)*

After auto-fix, report what the engine changed:

```typescript
// Proposed new interfaces (not yet implemented)
interface FixReport extends DrcReport {
  changes: LayoutChange[];
}

interface LayoutChange {
  elementId: string;
  ruleId: string;            // Which rule caused the change
  property: string;          // 'x', 'y', 'width', 'height'
  before: number;
  after: number;
}
```

This tells the LLM (and the user) exactly what the engine did, enabling:
- Confidence that fixes were applied correctly
- Understanding of how rules interact
- Ability to accept or reject specific changes

## Proposed: Spec-Level Feedback *(not yet implemented)*

### The Mismatch

The DRC operates on `LayoutResult` (pixel coordinates), but the LLM generates `GraphSpec` (node dimensions, not positions). When a violation says "move node X 15px right," the LLM can't act on this — it doesn't control positions, only dimensions and structure.

**What the LLM *can* change:**
- Node `width` and `height`
- Edge connections (source, target)
- Group membership
- Node ordering in arrays (affects dagre's default rank assignment)
- Layout options (rankdir, ranksep, nodesep)

**Spec-level suggestions:**

```typescript
// Proposed new interface (not yet implemented)
interface SpecSuggestion {
  type: 'resize-node' | 'change-group' | 'add-group' | 'adjust-layout-options';
  target: string;
  reason: string;
  specChange: Partial<GraphNode> | Partial<LayoutOptions>;
}
```

Example:
```json
{
  "type": "resize-node",
  "target": "auth-service",
  "reason": "Label 'Authentication Service Handler' exceeds node width",
  "specChange": { "width": 180 }
}
```

This bridges the gap between layout-level violations and spec-level actions.

## Proposed: Prompt Template for LLM Integration *(not yet implemented)*

The library could ship a prompt template that teaches LLMs how to use the feedback:

```typescript
export function drcPromptContext(report: DrcReport): string {
  if (report.passed) return 'Diagram passed all design rule checks.';

  return `The diagram has ${report.violations.length} violations:
${report.violations.map(v =>
  `- [${v.severity}] ${v.message}${v.suggestion ? ` → ${v.suggestion}` : ''}`
).join('\n')}

To fix these, adjust the GraphSpec as follows:
${report.violations.filter(v => v.fixes).map(v =>
  v.fixes!.map(f => `- ${f.type} ${f.target}: ${JSON.stringify(f.changes)}`).join('\n')
).join('\n')}`;
}
```

This is a convenience — it formats the report into text that can be appended to an LLM prompt for the refinement loop.

> **Integration with constraint primitives:** `ai-agent-rule-authoring.md` proposes declarative constraint rules that have known fix strategies. These primitives can automatically generate `suggestion` and `fixes` fields, making structured feedback available without rule authors having to implement it manually.

## Implementation Strategy

### Phase 1: Suggestions in Violations (low effort, high value)
- Add `suggestion: string` to existing rule `check()` methods
- Each rule generates a human-readable fix hint alongside the violation
- No schema changes needed — `suggestion` is an optional string on `Violation`

### Phase 2: Machine-Readable Fixes (medium effort, high value for automation)
- Add `SuggestedFix` interface
- Rules that can suggest precise changes populate the `fixes` array
- Not all rules can — crossing-minimization suggestions are complex

### Phase 3: Fix Change Tracking (medium effort, medium value)
- Engine diffs layout before/after fix
- Reports per-element, per-property changes
- Useful for transparency and debugging

### Phase 4: Spec-Level Feedback (medium effort, high value for LLMs)
- Bridge between layout violations and spec changes
- Requires understanding which spec changes affect which layout properties
- Most valuable for label-legibility and node-sizing issues

## Open Questions

1. **Should suggestions be normative?** If the LLM follows a suggestion and it makes things worse, who's at fault? Suggestions should be framed as hints, not commands.

2. **How detailed should change tracking be?** Tracking every node position change through 6 rules produces verbose output. May need summarization (e.g., "SpacingRule moved 3 nodes" rather than listing each one).

3. **Should the library own the refinement loop?** A `refineWithLlm(spec, llmCallback, maxIterations)` function would close the loop entirely, but couples the library to LLM invocation patterns. Better to stay as a library and let the caller manage the loop.
