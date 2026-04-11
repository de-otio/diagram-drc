# Analysis: Engine Pipeline Improvements

## Current Engine Design

The `DrcEngine` (`engine.ts`) has a clean, minimal design:

```
check(): rules.forEach(r => r.check()) → DrcReport
fix():   clone → rules.forEach(r => r.fix()) → check() → { layout, report }
```

This works well. The improvements below are targeted refinements, not a redesign.

> **Note on async layout:** Per `layout-engine-strategy.md`, the layout step is now async (to accommodate ELK.js as the default engine). The DRC engine itself remains synchronous — it receives a `LayoutResult` after the `await` and runs all rules synchronously. The async boundary lives in the pipeline/`generateDiagram()` layer, not in the engine.

## Improvement 1: Early Termination on Structural Errors *(proposed)*

**Problem:** If an LVS rule (see `lvs-validation.md`) detects missing nodes, the engine still runs all subsequent geometric rules on an incomplete layout. This wastes work and can produce confusing secondary violations.

**Current behavior:** All rules always run, regardless of prior results.

**Proposed behavior:** The engine stops after a rule produces `error`-severity violations if the rule is marked as a gate:

```typescript
// Proposed extension to LayoutRule (not yet implemented)
interface LayoutRule {
  // ... existing fields ...
  gate?: boolean;  // If true, error violations halt the pipeline
}
```

```typescript
// In fix():
for (const rule of this.rules) {
  current = rule.fix(current, spec);
  if (rule.gate) {
    const result = rule.check(current, spec);
    if (result.some(v => v.severity === 'error')) {
      return { layout: current, report: this.buildReport(results), halted: true };
    }
  }
}
```

**Impact:** Small code change, meaningful for structural validation rules.

> **Cross-references:** `lvs-validation.md` now uses `gate: true` in its implementation sketch. `custom-rule-decks.md` includes `gate` alongside the `phase` field in its proposed `LayoutRule` extensions.

**Alternative:** Instead of a `gate` field, the engine could halt on *any* error-severity violation from *any* rule. Simpler, but prevents running spacing fixes when a crossing warning exists.

## Improvement 2: Export `cloneLayout` *(proposed)*

**Problem:** Rule authors who implement `fix()` need to clone `LayoutResult` objects. The engine has `cloneLayout()` as a private function in `engine.ts`, but it's not exported from the package.

**Current workaround:** Rule authors must write their own deep-clone logic, risking bugs (forgetting to clone edge points, Maps, etc.).

**Proposed change:** Extract `cloneLayout()` as a standalone exported utility:

```typescript
// src/utils.ts (or inline in types.ts)
export function cloneLayout(layout: LayoutResult): LayoutResult {
  const nodes = new Map<string, LayoutNode>();
  for (const [id, node] of layout.nodes) {
    nodes.set(id, { ...node });
  }
  const edges = layout.edges.map(e => ({
    ...e,
    points: e.points.map(p => ({ ...p })),
  }));
  return { nodes, edges, width: layout.width, height: layout.height };
}
```

**Effort:** Trivial — move existing code, add export to `src/index.ts`.

**Note:** Several existing rules already perform their own partial cloning (e.g., SpacingRule clones nodes in its repulsion loop). With `cloneLayout` exported, these could be simplified, but that's optional cleanup.

> **Also referenced in:** `custom-rule-decks.md` (Priority 2) and `ai-agent-rule-authoring.md` (Priority 4). This is the canonical description of the change; those documents cross-reference here.

## Improvement 3: Post-Fix Regression Detection *(proposed)*

**Problem:** When rules conflict (one pushes nodes apart, another pulls them together), the engine silently applies both. The final `check()` catches remaining violations but doesn't distinguish between *pre-existing* violations and *regressions* introduced by fixes.

**Current behavior:**
```
fix() → check() → report (all violations lumped together)
```

**Proposed behavior:**
```
check() → baseline violations
fix() → check() → final violations
diff(baseline, final) → regressions
```

```typescript
// Proposed extension to DrcReport (not yet implemented)
interface DrcReport {
  // ... existing fields ...
  regressions?: Violation[];  // Violations not present before fixing
}
```

A regression is a violation in the final report whose `ruleId + affectedElements` combination was not present in the baseline report.

**Implementation:**

```typescript
fix(layout: LayoutResult, spec: GraphSpec) {
  const baseline = this.check(layout, spec);
  const baselineKeys = new Set(
    baseline.violations.map(v => `${v.ruleId}:${v.affectedElements.sort().join(',')}`)
  );

  let current = this.cloneLayout(layout);
  for (const rule of this.rules) {
    current = rule.fix(current, spec);
  }

  const final = this.check(current, spec);
  const regressions = final.violations.filter(v => {
    const key = `${v.ruleId}:${v.affectedElements.sort().join(',')}`;
    return !baselineKeys.has(key);
  });

  return { layout: current, report: { ...final, regressions } };
}
```

**Cost:** One extra `check()` call (the baseline). At current graph sizes this is negligible.

**Value:** Surfaces rule conflicts that are otherwise invisible. Particularly useful when users compose custom rule decks where interactions aren't pre-tested.

> **Also referenced in:** `custom-rule-decks.md` (Gap 4). This is the canonical description with implementation detail; that document cross-references here.

## Improvement 4: Fix Iteration with Convergence *(proposed)*

**Problem:** Some fix interactions are order-dependent. Running the fix pipeline once may not reach a stable state — rule A's fix may create a new violation for rule B, and vice versa.

**Current behavior:** Single-pass fix. SpacingRule has its own internal iteration (10 rounds), but the *inter-rule* pipeline runs once.

**Proposed behavior:** Optionally iterate the full fix pipeline until violations stabilize:

```typescript
// Proposed extension to EngineOptions (not yet implemented)
interface EngineOptions {
  // ... existing fields ...
  maxFixIterations?: number;  // default: 1 (current behavior)
}
```

```typescript
fix(layout, spec) {
  let current = this.cloneLayout(layout);
  for (let i = 0; i < this.maxFixIterations; i++) {
    const before = this.check(current, spec).violations.length;
    for (const rule of this.rules) {
      current = rule.fix(current, spec);
    }
    const after = this.check(current, spec).violations.length;
    if (after >= before) break;  // Not improving — stop
  }
  return { layout: current, report: this.check(current, spec) };
}
```

**Risk:** Oscillation — two rules fighting indefinitely. The `after >= before` guard prevents this, but could stop prematurely if a fix temporarily increases violations before resolving them.

**Recommendation:** Keep the default at 1. Document the option for advanced users who observe inter-rule conflicts. This is a low-priority enhancement.

## Improvement 5: Per-Rule Timing *(proposed)*

**Problem:** When diagrams grow larger, it's useful to know which rules are slow. Currently there's no profiling information.

**Proposed change:** Add timing to `RuleResult`:

```typescript
// Proposed extension to RuleResult (not yet implemented)
interface RuleResult {
  // ... existing fields ...
  checkDurationMs?: number;
  fixDurationMs?: number;
}
```

```typescript
const start = performance.now();
const violations = rule.check(current, spec);
const checkDuration = performance.now() - start;
```

**Effort:** Trivial. Useful for identifying bottlenecks as rule count and graph size grow.

## Summary

| Improvement | Effort | Impact | Breaks API? |
|-------------|--------|--------|-------------|
| Export `cloneLayout` | Trivial | Medium | No — additive |
| Post-fix regression detection | Small | Medium | No — additive field |
| Early termination (`gate`) | Small | Medium | No — optional field |
| Per-rule timing | Trivial | Low | No — optional field |
| Fix iteration | Small | Low | No — optional config |
