import { MedianPositionRule } from '../../rules/median-position.js';
import type { LayoutResult, GraphSpec } from '../../types.js';

/**
 * One group with 4 nodes in a diamond-ish layout:
 *
 *        igw (top, x=400)
 *          |
 *       subnet (middle, x=800 — far right of median)
 *        / | \
 *   nat1  nat2  nat3  (bottom row, x=200/400/600)
 *
 * subnet's median should be ~400 (median of igw + 3 NATs).
 */
function makeFanOut(): { spec: GraphSpec; layout: LayoutResult } {
  const spec: GraphSpec = {
    nodes: [
      { id: 'igw', label: 'IGW', width: 50, height: 50 },
      { id: 'sub', label: 'Subnet', width: 50, height: 50 },
      { id: 'n1', label: 'NAT1', width: 50, height: 50 },
      { id: 'n2', label: 'NAT2', width: 50, height: 50 },
      { id: 'n3', label: 'NAT3', width: 50, height: 50 },
    ],
    edges: [
      { id: 'e1', source: 'igw', target: 'sub' },
      { id: 'e2', source: 'sub', target: 'n1' },
      { id: 'e3', source: 'sub', target: 'n2' },
      { id: 'e4', source: 'sub', target: 'n3' },
    ],
    groups: [
      { id: 'g', label: 'VPC', children: ['igw', 'sub', 'n1', 'n2', 'n3'] },
    ],
  };
  const layout: LayoutResult = {
    nodes: new Map([
      ['g', { id: 'g', x: 500, y: 300, width: 800, height: 400 }],
      ['igw', { id: 'igw', x: 400, y: 100, width: 50, height: 50 }],
      ['sub', { id: 'sub', x: 800, y: 250, width: 50, height: 50 }],
      ['n1', { id: 'n1', x: 200, y: 400, width: 50, height: 50 }],
      ['n2', { id: 'n2', x: 400, y: 400, width: 50, height: 50 }],
      ['n3', { id: 'n3', x: 600, y: 400, width: 50, height: 50 }],
    ]),
    edges: [],
    width: 900,
    height: 500,
  };
  return { spec, layout };
}

describe('MedianPositionRule', () => {
  const rule = new MedianPositionRule();

  it('has id, description, and severity', () => {
    expect(rule.id).toBe('median-position');
    expect(rule.description).toBeTruthy();
    expect(rule.severity).toBe('warning');
  });

  // ── check ─────────────────────────────────────────────────────────

  describe('check', () => {
    it('reports violations when nodes are far from their median', () => {
      const { spec, layout } = makeFanOut();
      const violations = rule.check(layout, spec);
      // sub at x=800, median of [igw(400), n1(200), n2(400), n3(600)] = 400
      // delta = 400, group width = 800, threshold 0.15 → 120px → violated
      const subViolation = violations.find((v) =>
        v.affectedElements.includes('sub'),
      );
      expect(subViolation).toBeDefined();
    });

    it('reports no violation for a node already at its median', () => {
      const { spec, layout } = makeFanOut();
      // Move sub to the median of its neighbors [igw(400), n1(200), n2(400), n3(600)] → 400
      layout.nodes.get('sub')!.x = 400;
      const violations = rule.check(layout, spec);
      const subViolation = violations.find((v) =>
        v.affectedElements.includes('sub'),
      );
      expect(subViolation).toBeUndefined();
    });

    it('skips nodes with no intra-group neighbors', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [], // no edges
        groups: [{ id: 'g', label: 'G', children: ['a', 'b'] }],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['g', { id: 'g', x: 200, y: 100, width: 400, height: 200 }],
          ['a', { id: 'a', x: 50, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 350, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 200,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('ignores cross-group edges', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'ext', label: 'Ext', width: 50, height: 50 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'ext' }],
        groups: [
          { id: 'g1', label: 'G1', children: ['a'] },
          { id: 'g2', label: 'G2', children: ['ext'] },
        ],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['g1', { id: 'g1', x: 100, y: 100, width: 200, height: 200 }],
          ['g2', { id: 'g2', x: 400, y: 100, width: 200, height: 200 }],
          ['a', { id: 'a', x: 50, y: 100, width: 50, height: 50 }],
          ['ext', { id: 'ext', x: 400, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 500,
        height: 200,
      };
      // 'a' has no intra-group neighbors → no violations
      expect(rule.check(layout, spec)).toHaveLength(0);
    });
  });

  // ── fix ───────────────────────────────────────────────────────────

  describe('fix', () => {
    it('moves nodes toward the median of their neighbors', () => {
      const { spec, layout } = makeFanOut();
      const fixed = rule.fix(layout, spec);

      const sub = fixed.nodes.get('sub')!;
      // sub should move from x=800 toward median ~400
      expect(sub.x).toBeLessThan(600);
    });

    it('does not move nodes without intra-group edges', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [],
        groups: [{ id: 'g', label: 'G', children: ['a', 'b'] }],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['g', { id: 'g', x: 200, y: 100, width: 400, height: 200 }],
          ['a', { id: 'a', x: 50, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 350, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 200,
      };
      const fixed = rule.fix(layout, spec);
      expect(fixed.nodes.get('a')!.x).toBe(50);
      expect(fixed.nodes.get('b')!.x).toBe(350);
    });

    it('does not mutate the original layout', () => {
      const { spec, layout } = makeFanOut();
      const origSubX = layout.nodes.get('sub')!.x;
      rule.fix(layout, spec);
      expect(layout.nodes.get('sub')!.x).toBe(origSubX);
    });

    it('converges after multiple iterations', () => {
      const { spec, layout } = makeFanOut();
      const fixed = rule.fix(layout, spec);

      // After convergence, sub should be very close to the
      // (iteratively stabilised) median.
      const sub = fixed.nodes.get('sub')!;
      const n1 = fixed.nodes.get('n1')!;
      const n2 = fixed.nodes.get('n2')!;
      const n3 = fixed.nodes.get('n3')!;
      const igw = fixed.nodes.get('igw')!;

      const xs = [igw.x, n1.x, n2.x, n3.x].sort((a, b) => a - b);
      const median = (xs[1] + xs[2]) / 2;
      expect(Math.abs(sub.x - median)).toBeLessThan(50);
    });

    it('refits the group envelope after repositioning', () => {
      const { spec, layout } = makeFanOut();
      const fixed = rule.fix(layout, spec);
      const g = fixed.nodes.get('g')!;
      const sub = fixed.nodes.get('sub')!;
      // sub should be within group bounds
      expect(sub.x).toBeGreaterThanOrEqual(g.x - g.width / 2);
      expect(sub.x).toBeLessThanOrEqual(g.x + g.width / 2);
    });

    it('respects a custom strength option', () => {
      const weak = new MedianPositionRule({ strength: 0.1, iterations: 1 });
      const strong = new MedianPositionRule({ strength: 1.0, iterations: 1 });

      const { spec, layout } = makeFanOut();
      const weakDelta = Math.abs(
        weak.fix(layout, spec).nodes.get('sub')!.x - 800,
      );
      const strongDelta = Math.abs(
        strong.fix(layout, spec).nodes.get('sub')!.x - 800,
      );
      expect(strongDelta).toBeGreaterThan(weakDelta);
    });
  });
});
