import { SpacingRule } from '../../rules/spacing.js';
import type { LayoutResult, GraphSpec } from '../../types.js';

const spec: GraphSpec = {
  nodes: [
    { id: 'a', label: 'A', width: 50, height: 50 },
    { id: 'b', label: 'B', width: 50, height: 50 },
  ],
  edges: [],
};

// Nodes are centered at (x, y) with given width/height
function makeLayout(
  ax: number, ay: number,
  bx: number, by: number,
  aw = 50, ah = 50, bw = 50, bh = 50,
): LayoutResult {
  return {
    nodes: new Map([
      ['a', { id: 'a', x: ax, y: ay, width: aw, height: ah }],
      ['b', { id: 'b', x: bx, y: by, width: bw, height: bh }],
    ]),
    edges: [],
    width: 600,
    height: 600,
  };
}

describe('SpacingRule', () => {
  const rule = new SpacingRule();

  it('has id, description, and severity', () => {
    expect(rule.id).toBe('spacing');
    expect(rule.description).toBeTruthy();
    expect(rule.severity).toBe('warning');
  });

  describe('check', () => {
    it('returns no violations when nodes are far apart', () => {
      // a: x 75–125, b: x 175–225 → gapX = 50 > 20
      const layout = makeLayout(100, 100, 200, 100);
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('returns no violations when nodes are exactly at minGap', () => {
      // a right edge at 125, b left edge at 145 → gap = 20 (not < 20)
      const layout = makeLayout(100, 100, 170, 100);
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('reports a violation when nodes overlap', () => {
      // a: x 75–125, b: x 95–145 → overlap
      const layout = makeLayout(100, 100, 120, 100);
      const violations = rule.check(layout, spec);
      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('spacing');
      expect(violations[0].severity).toBe('warning');
      expect(violations[0].affectedElements).toContain('a');
      expect(violations[0].affectedElements).toContain('b');
    });

    it('reports a violation when nodes are inside minGap horizontally', () => {
      // a right at 125, b left at 130 → gapX = 5 < 20
      const layout = makeLayout(100, 100, 155, 100);
      expect(rule.check(layout, spec)).toHaveLength(1);
    });

    it('reports a violation when nodes are inside minGap vertically', () => {
      // a bottom at 125, b top at 130 → gapY = 5 < 20
      const layout = makeLayout(100, 100, 100, 155);
      expect(rule.check(layout, spec)).toHaveLength(1);
    });

    it('includes node ids in the violation message', () => {
      const layout = makeLayout(100, 100, 120, 100);
      const violations = rule.check(layout, spec);
      expect(violations[0].message).toContain('"a"');
      expect(violations[0].message).toContain('"b"');
    });

    it('includes the minGap in the violation message', () => {
      const layout = makeLayout(100, 100, 120, 100);
      const violations = rule.check(layout, spec);
      expect(violations[0].message).toContain('min: 20px');
    });

    it('includes a bounding region in each violation', () => {
      const layout = makeLayout(100, 100, 120, 100);
      const violations = rule.check(layout, spec);
      const region = violations[0].region;
      expect(region).toBeDefined();
      expect(region).toHaveProperty('x');
      expect(region).toHaveProperty('y');
      expect(region).toHaveProperty('width');
      expect(region).toHaveProperty('height');
    });

    it('uses a custom minGap when provided', () => {
      const strictRule = new SpacingRule({ minGap: 100 });
      // gap = 50, which passes default rule but fails strict rule
      const layout = makeLayout(100, 100, 200, 100);
      expect(rule.check(layout, spec)).toHaveLength(0);
      expect(strictRule.check(layout, spec)).toHaveLength(1);
    });

    it('reports correct distance in message for custom minGap', () => {
      const strictRule = new SpacingRule({ minGap: 100 });
      const layout = makeLayout(100, 100, 200, 100);
      const violations = strictRule.check(layout, spec);
      expect(violations[0].message).toContain('min: 100px');
    });

    it('excludes group nodes from spacing check', () => {
      const specWithGroup: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [],
        groups: [{ id: 'g1', label: 'G', children: ['a', 'b'] }],
      };
      const layoutWithGroup: LayoutResult = {
        nodes: new Map([
          ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 120, y: 100, width: 50, height: 50 }],
          // g1 overlaps with a and b but is a group — should be excluded
          ['g1', { id: 'g1', x: 110, y: 100, width: 200, height: 200 }],
        ]),
        edges: [],
        width: 600,
        height: 600,
      };
      const violations = rule.check(layoutWithGroup, specWithGroup);
      // g1 must not appear as an affected element
      expect(violations.every((v) => !v.affectedElements.includes('g1'))).toBe(true);
    });

    it('handles diagonal proximity (gap via sqrt formula)', () => {
      // a: 75–125 / 75–125, b: 200–250 / 200–250
      // gapX = 75, gapY = 75 → sqrt(75² + 75²) ≈ 106 > 20 → no violation
      const layout = makeLayout(100, 100, 225, 225);
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('detects violation when diagonal gap is below minGap', () => {
      // a: 75–125 / 75–125, b: 132–182 / 132–182
      // gapX = 7, gapY = 7 → sqrt(49+49) ≈ 9.9 < 20 → violation
      const layout = makeLayout(100, 100, 157, 157);
      expect(rule.check(layout, spec)).toHaveLength(1);
    });
  });

  describe('fix', () => {
    it('resolves overlapping violations after fix', () => {
      const layout = makeLayout(100, 100, 105, 100);
      const fixed = rule.fix(layout, spec);
      expect(rule.check(fixed, spec)).toHaveLength(0);
    });

    it('does not move nodes that already satisfy the gap', () => {
      const layout = makeLayout(100, 100, 200, 100);
      const fixed = rule.fix(layout, spec);
      expect(fixed.nodes.get('a')!.x).toBeCloseTo(100);
      expect(fixed.nodes.get('b')!.x).toBeCloseTo(200);
    });

    it('does not mutate the original layout', () => {
      const layout = makeLayout(100, 100, 105, 100);
      const origAX = layout.nodes.get('a')!.x;
      rule.fix(layout, spec);
      expect(layout.nodes.get('a')!.x).toBe(origAX);
    });

    it('preserves edges in the fixed layout', () => {
      const layoutWithEdges: LayoutResult = {
        nodes: new Map([
          ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 105, y: 100, width: 50, height: 50 }],
        ]),
        edges: [{ source: 'a', target: 'b', points: [{ x: 150, y: 100 }] }],
        width: 600,
        height: 600,
      };
      const fixed = rule.fix(layoutWithEdges, spec);
      expect(fixed.edges).toHaveLength(1);
      expect(fixed.edges[0].points).toHaveLength(1);
    });

    it('preserves layout width and height', () => {
      const layout = makeLayout(100, 100, 105, 100);
      const fixed = rule.fix(layout, spec);
      expect(fixed.width).toBe(layout.width);
      expect(fixed.height).toBe(layout.height);
    });

    it('excludes group nodes from fix', () => {
      const specWithGroup: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [],
        groups: [{ id: 'g1', label: 'G', children: ['a', 'b'] }],
      };
      const layoutWithGroup: LayoutResult = {
        nodes: new Map([
          ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 120, y: 100, width: 50, height: 50 }],
          ['g1', { id: 'g1', x: 110, y: 100, width: 200, height: 200 }],
        ]),
        edges: [],
        width: 600,
        height: 600,
      };
      const origG1X = layoutWithGroup.nodes.get('g1')!.x;
      const fixed = rule.fix(layoutWithGroup, specWithGroup);
      expect(fixed.nodes.get('g1')!.x).toBe(origG1X);
    });

    it('converges within 10 iterations for heavily overlapping nodes', () => {
      // Nodes nearly on top of each other with a tiny offset to provide direction
      const layout = makeLayout(100, 100, 101, 100);
      const fixed = rule.fix(layout, spec);
      // After fix, violations should be resolved
      expect(rule.check(fixed, spec)).toHaveLength(0);
    });
  });
});
