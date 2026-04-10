/**
 * DRC Engine — orchestrates rule evaluation over a laid-out graph.
 *
 * Two modes:
 *  - check(): detect violations without modifying the layout
 *  - fix():   apply rule fixes sequentially, then report remaining violations
 */

import type {
  LayoutResult,
  GraphSpec,
  LayoutRule,
  DrcReport,
  RuleResult,
  Violation,
  Severity,
  EngineOptions,
  LayoutNode,
} from './types.js';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export class DrcEngine {
  private rules: LayoutRule[];
  private minSeverity: Severity;

  constructor(options?: EngineOptions) {
    this.rules = options?.rules ?? [];
    this.minSeverity = options?.minSeverity ?? 'info';
  }

  /** Add a rule to the engine. Returns this for chaining. */
  addRule(rule: LayoutRule): this {
    this.rules.push(rule);
    return this;
  }

  /** Run all rules in check mode — no mutations. */
  check(layout: LayoutResult, spec: GraphSpec): DrcReport {
    const results: RuleResult[] = [];
    const allViolations: Violation[] = [];

    for (const rule of this.rules) {
      const violations = rule.check(layout, spec)
        .filter((v) => SEVERITY_ORDER[v.severity] <= SEVERITY_ORDER[this.minSeverity]);
      results.push({
        ruleId: rule.id,
        passed: violations.length === 0,
        violations,
      });
      allViolations.push(...violations);
    }

    return {
      violations: allViolations,
      results,
      passed: allViolations.every((v) => v.severity !== 'error'),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run all rules in fix mode, then check for remaining violations.
   * Rules are applied in registration order — order matters.
   */
  fix(layout: LayoutResult, spec: GraphSpec): { layout: LayoutResult; report: DrcReport } {
    let current = cloneLayout(layout);

    for (const rule of this.rules) {
      current = rule.fix(current, spec);
    }

    const report = this.check(current, spec);
    return { layout: current, report };
  }
}

/** Create an engine with the given options. */
export function createEngine(options?: EngineOptions): DrcEngine {
  return new DrcEngine(options);
}

/** Deep-clone a LayoutResult so rules can mutate safely. */
function cloneLayout(layout: LayoutResult): LayoutResult {
  const nodes = new Map<string, LayoutNode>();
  for (const [id, node] of layout.nodes) {
    nodes.set(id, { ...node });
  }
  return {
    nodes,
    edges: layout.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ ...p })),
    })),
    width: layout.width,
    height: layout.height,
  };
}
