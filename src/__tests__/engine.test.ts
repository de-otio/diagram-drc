import { DrcEngine } from '../engine.js';
import type { LayoutResult, GraphSpec, LayoutRule, Violation } from '../types.js';

const spec: GraphSpec = {
  nodes: [
    { id: 'a', label: 'A', width: 50, height: 50 },
    { id: 'b', label: 'B', width: 50, height: 50 },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b' },
  ],
};

const layout: LayoutResult = {
  nodes: new Map([
    ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
    ['b', { id: 'b', x: 200, y: 200, width: 50, height: 50 }],
  ]),
  edges: [{ source: 'a', target: 'b', points: [] }],
  width: 300,
  height: 300,
};

const passingRule: LayoutRule = {
  id: 'pass',
  description: 'Always passes',
  severity: 'warning',
  check: () => [],
  fix: (l) => l,
};

const failingRule: LayoutRule = {
  id: 'fail',
  description: 'Always fails',
  severity: 'error',
  check: (): Violation[] => [{
    ruleId: 'fail',
    severity: 'error',
    message: 'Something is wrong',
    affectedElements: ['a'],
  }],
  fix: (l) => l,
};

describe('DrcEngine', () => {
  it('reports no violations when all rules pass', () => {
    const engine = new DrcEngine({ rules: [passingRule] });
    const report = engine.check(layout, spec);
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('reports violations from failing rules', () => {
    const engine = new DrcEngine({ rules: [failingRule] });
    const report = engine.check(layout, spec);
    expect(report.passed).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].ruleId).toBe('fail');
  });

  it('runs fix then check', () => {
    const engine = new DrcEngine({ rules: [passingRule] });
    const { report } = engine.fix(layout, spec);
    expect(report.passed).toBe(true);
  });

  it('supports addRule chaining', () => {
    const engine = new DrcEngine();
    engine.addRule(passingRule).addRule(failingRule);
    const report = engine.check(layout, spec);
    expect(report.results).toHaveLength(2);
  });

  it('includes per-rule results', () => {
    const engine = new DrcEngine({ rules: [passingRule, failingRule] });
    const report = engine.check(layout, spec);
    expect(report.results[0].ruleId).toBe('pass');
    expect(report.results[0].passed).toBe(true);
    expect(report.results[1].ruleId).toBe('fail');
    expect(report.results[1].passed).toBe(false);
  });
});
