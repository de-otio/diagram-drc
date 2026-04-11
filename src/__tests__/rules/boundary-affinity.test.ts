import { BoundaryAffinityRule } from '../../rules/boundary-affinity.js';
import type { LayoutResult, GraphSpec } from '../../types.js';

/**
 * Helper: two groups side-by-side with a cross-group edge.
 *
 *   groupA (left, x=200, w=200)     groupB (right, x=500, w=200)
 *     [a1]  [a2]                       [b1]  [b2]
 *
 *   Edge: a1 → b1
 */
function makeSideBySide(overrides?: {
  a1x?: number;
  b1x?: number;
}): { spec: GraphSpec; layout: LayoutResult } {
  const spec: GraphSpec = {
    nodes: [
      { id: 'a1', label: 'A1', width: 50, height: 50 },
      { id: 'a2', label: 'A2', width: 50, height: 50 },
      { id: 'b1', label: 'B1', width: 50, height: 50 },
      { id: 'b2', label: 'B2', width: 50, height: 50 },
    ],
    edges: [{ id: 'e1', source: 'a1', target: 'b1' }],
    groups: [
      { id: 'gA', label: 'Group A', children: ['a1', 'a2'] },
      { id: 'gB', label: 'Group B', children: ['b1', 'b2'] },
    ],
  };
  const layout: LayoutResult = {
    nodes: new Map([
      ['gA', { id: 'gA', x: 200, y: 200, width: 200, height: 100 }],
      ['gB', { id: 'gB', x: 500, y: 200, width: 200, height: 100 }],
      // a1 starts on the LEFT of gA (far from gB)
      ['a1', { id: 'a1', x: overrides?.a1x ?? 150, y: 200, width: 50, height: 50 }],
      ['a2', { id: 'a2', x: 250, y: 200, width: 50, height: 50 }],
      // b1 starts on the RIGHT of gB (far from gA)
      ['b1', { id: 'b1', x: overrides?.b1x ?? 550, y: 200, width: 50, height: 50 }],
      ['b2', { id: 'b2', x: 450, y: 200, width: 50, height: 50 }],
    ]),
    edges: [{ source: 'a1', target: 'b1', points: [] }],
    width: 700,
    height: 400,
  };
  return { spec, layout };
}

describe('BoundaryAffinityRule', () => {
  const rule = new BoundaryAffinityRule();

  it('has id, description, and severity', () => {
    expect(rule.id).toBe('boundary-affinity');
    expect(rule.description).toBeTruthy();
    expect(rule.severity).toBe('info');
  });

  // ── check ─────────────────────────────────────────────────────────

  describe('check', () => {
    it('reports violations when cross-connected nodes are on the wrong side', () => {
      const { spec, layout } = makeSideBySide();
      const violations = rule.check(layout, spec);
      // a1 is on the LEFT of gA but should be on the RIGHT (facing gB)
      // b1 is on the RIGHT of gB but should be on the LEFT (facing gA)
      expect(violations.length).toBeGreaterThanOrEqual(2);
      const ids = violations.map((v) => v.affectedElements[0]);
      expect(ids).toContain('a1');
      expect(ids).toContain('b1');
    });

    it('reports no violations when nodes are already near the correct boundary', () => {
      // a1 on the right edge of gA (near gB), b1 on the left edge of gB (near gA)
      const { spec, layout } = makeSideBySide({ a1x: 270, b1x: 430 });
      const violations = rule.check(layout, spec);
      expect(violations).toHaveLength(0);
    });

    it('skips edges within the same group', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        groups: [{ id: 'g1', label: 'G', children: ['a', 'b'] }],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['g1', { id: 'g1', x: 200, y: 200, width: 200, height: 100 }],
          ['a', { id: 'a', x: 150, y: 200, width: 50, height: 50 }],
          ['b', { id: 'b', x: 250, y: 200, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 400,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('skips edges where neither endpoint belongs to a group', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['a', { id: 'a', x: 100, y: 200, width: 50, height: 50 }],
          ['b', { id: 'b', x: 300, y: 200, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 400,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('deduplicates violations for nodes with multiple cross-group edges', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b1', label: 'B1', width: 50, height: 50 },
          { id: 'b2', label: 'B2', width: 50, height: 50 },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b1' },
          { id: 'e2', source: 'a', target: 'b2' },
        ],
        groups: [
          { id: 'gA', label: 'A', children: ['a'] },
          { id: 'gB', label: 'B', children: ['b1', 'b2'] },
        ],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['gA', { id: 'gA', x: 100, y: 200, width: 200, height: 100 }],
          ['gB', { id: 'gB', x: 500, y: 200, width: 200, height: 100 }],
          ['a', { id: 'a', x: 50, y: 200, width: 50, height: 50 }],
          ['b1', { id: 'b1', x: 550, y: 180, width: 50, height: 50 }],
          ['b2', { id: 'b2', x: 550, y: 220, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 700,
        height: 400,
      };
      const violations = rule.check(layout, spec);
      const aViolations = violations.filter((v) => v.affectedElements[0] === 'a');
      expect(aViolations).toHaveLength(1); // not 2
    });

    it('skips horizontal pull when groups are primarily stacked vertically', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        groups: [
          { id: 'gA', label: 'A', children: ['a'] },
          { id: 'gB', label: 'B', children: ['b'] },
        ],
      };
      // Groups are stacked: same x, 300px vertical separation
      const layout: LayoutResult = {
        nodes: new Map([
          ['gA', { id: 'gA', x: 200, y: 100, width: 200, height: 100 }],
          ['gB', { id: 'gB', x: 200, y: 400, width: 200, height: 100 }],
          ['a', { id: 'a', x: 150, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 250, y: 400, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 600,
      };
      // dx=0 < dy*0.5=150 → skip x check → no violations
      expect(rule.check(layout, spec)).toHaveLength(0);
    });
  });

  // ── fix ───────────────────────────────────────────────────────────

  describe('fix', () => {
    it('pulls cross-connected nodes toward the correct boundary', () => {
      const { spec, layout } = makeSideBySide();
      const fixed = rule.fix(layout, spec);

      const a1 = fixed.nodes.get('a1')!;
      const b1 = fixed.nodes.get('b1')!;
      const origA1x = layout.nodes.get('a1')!.x;
      const origB1x = layout.nodes.get('b1')!.x;

      // a1 should move RIGHT (toward gB)
      expect(a1.x).toBeGreaterThan(origA1x);
      // b1 should move LEFT (toward gA)
      expect(b1.x).toBeLessThan(origB1x);
    });

    it('does not move nodes without cross-group edges', () => {
      const { spec, layout } = makeSideBySide();
      const fixed = rule.fix(layout, spec);
      // a2 and b2 have no cross-group edges — should stay put
      expect(fixed.nodes.get('a2')!.x).toBe(layout.nodes.get('a2')!.x);
      expect(fixed.nodes.get('b2')!.x).toBe(layout.nodes.get('b2')!.x);
    });

    it('does not mutate the original layout', () => {
      const { spec, layout } = makeSideBySide();
      const origA1x = layout.nodes.get('a1')!.x;
      rule.fix(layout, spec);
      expect(layout.nodes.get('a1')!.x).toBe(origA1x);
    });

    it('preserves edges in the fixed layout', () => {
      const { spec, layout } = makeSideBySide();
      const fixed = rule.fix(layout, spec);
      expect(fixed.edges).toHaveLength(1);
    });

    it('recalculates group bounds after moving children', () => {
      const { spec, layout } = makeSideBySide();
      const fixed = rule.fix(layout, spec);
      const gA = fixed.nodes.get('gA')!;
      const a1 = fixed.nodes.get('a1')!;
      const a2 = fixed.nodes.get('a2')!;
      // a1 and a2 should both be inside gA bounds
      expect(a1.x - a1.width / 2).toBeGreaterThanOrEqual(gA.x - gA.width / 2 - 1);
      expect(a2.x + a2.width / 2).toBeLessThanOrEqual(gA.x + gA.width / 2 + 1);
    });

    it('averages pulls from multiple external groups', () => {
      // Node a connects to gB (right) and gC (left) — should stay roughly centred
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
          { id: 'c', label: 'C', width: 50, height: 50 },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'a', target: 'c' },
        ],
        groups: [
          { id: 'gA', label: 'A', children: ['a'] },
          { id: 'gB', label: 'B', children: ['b'] },
          { id: 'gC', label: 'C', children: ['c'] },
        ],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['gA', { id: 'gA', x: 300, y: 200, width: 200, height: 100 }],
          ['gB', { id: 'gB', x: 600, y: 200, width: 100, height: 100 }],
          ['gC', { id: 'gC', x: 50, y: 200, width: 100, height: 100 }],
          ['a', { id: 'a', x: 300, y: 200, width: 50, height: 50 }],
          ['b', { id: 'b', x: 600, y: 200, width: 50, height: 50 }],
          ['c', { id: 'c', x: 50, y: 200, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 700,
        height: 400,
      };
      const fixed = rule.fix(layout, spec);
      const a = fixed.nodes.get('a')!;
      // Pulled right toward gB AND left toward gC — should stay near centre
      expect(Math.abs(a.x - 300)).toBeLessThan(50);
    });

    it('does not move nodes when groups are vertically stacked', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        groups: [
          { id: 'gA', label: 'A', children: ['a'] },
          { id: 'gB', label: 'B', children: ['b'] },
        ],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['gA', { id: 'gA', x: 200, y: 100, width: 200, height: 100 }],
          ['gB', { id: 'gB', x: 200, y: 400, width: 200, height: 100 }],
          ['a', { id: 'a', x: 150, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 250, y: 400, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 600,
      };
      const fixed = rule.fix(layout, spec);
      expect(fixed.nodes.get('a')!.x).toBe(150);
      expect(fixed.nodes.get('b')!.x).toBe(250);
    });

    it('respects the strength option', () => {
      const weakRule = new BoundaryAffinityRule({ strength: 0.2 });
      const strongRule = new BoundaryAffinityRule({ strength: 1.0 });

      const { spec, layout } = makeSideBySide();
      const weakFixed = weakRule.fix(layout, spec);
      const strongFixed = strongRule.fix(layout, spec);

      const origA1x = layout.nodes.get('a1')!.x;
      const weakDelta = Math.abs(weakFixed.nodes.get('a1')!.x - origA1x);
      const strongDelta = Math.abs(strongFixed.nodes.get('a1')!.x - origA1x);
      expect(strongDelta).toBeGreaterThan(weakDelta);
    });
  });
});
