import { GroupProximityRule } from '../../rules/group-proximity.js';
import type { LayoutResult, GraphSpec } from '../../types.js';

/**
 * Three groups in a row:
 *
 *   gA (left)          gB (centre)         gC (right)
 *   [a1]               [b1]                [c1]
 *
 * Edge: a1 → c1   (cross-group: gA ↔ gC)
 *
 * gB sits between the connected pair, forcing long edges.
 * After fix, gA and gC should be adjacent (gB pushed to the side).
 */
function makeThreeGroups(): { spec: GraphSpec; layout: LayoutResult } {
  const spec: GraphSpec = {
    nodes: [
      { id: 'a1', label: 'A1', width: 50, height: 50 },
      { id: 'b1', label: 'B1', width: 50, height: 50 },
      { id: 'c1', label: 'C1', width: 50, height: 50 },
    ],
    edges: [{ id: 'e1', source: 'a1', target: 'c1' }],
    groups: [
      { id: 'gA', label: 'Group A', children: ['a1'] },
      { id: 'gB', label: 'Group B', children: ['b1'] },
      { id: 'gC', label: 'Group C', children: ['c1'] },
    ],
  };
  // gB is between gA and gC, wasting edge length.
  const layout: LayoutResult = {
    nodes: new Map([
      ['gA', { id: 'gA', x: 60, y: 100, width: 100, height: 100 }],
      ['gB', { id: 'gB', x: 220, y: 100, width: 100, height: 100 }],
      ['gC', { id: 'gC', x: 380, y: 100, width: 100, height: 100 }],
      ['a1', { id: 'a1', x: 60, y: 100, width: 50, height: 50 }],
      ['b1', { id: 'b1', x: 220, y: 100, width: 50, height: 50 }],
      ['c1', { id: 'c1', x: 380, y: 100, width: 50, height: 50 }],
    ]),
    edges: [{ source: 'a1', target: 'c1', points: [] }],
    width: 440,
    height: 200,
  };
  return { spec, layout };
}

describe('GroupProximityRule', () => {
  const rule = new GroupProximityRule();

  it('has id, description, and severity', () => {
    expect(rule.id).toBe('group-proximity');
    expect(rule.description).toBeTruthy();
    expect(rule.severity).toBe('info');
  });

  // ── check ─────────────────────────────────────────────────────────

  describe('check', () => {
    it('reports a violation when connected groups are separated', () => {
      const { spec, layout } = makeThreeGroups();
      const violations = rule.check(layout, spec);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0].ruleId).toBe('group-proximity');
    });

    it('reports no violations when there are no cross-group edges', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [],
        groups: [
          { id: 'gA', label: 'A', children: ['a'] },
          { id: 'gB', label: 'B', children: ['b'] },
        ],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['gA', { id: 'gA', x: 100, y: 100, width: 100, height: 100 }],
          ['gB', { id: 'gB', x: 300, y: 100, width: 100, height: 100 }],
          ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 300, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 200,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('reports no violations when groups are already optimally ordered', () => {
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
          ['gA', { id: 'gA', x: 60, y: 100, width: 100, height: 100 }],
          ['gB', { id: 'gB', x: 180, y: 100, width: 100, height: 100 }],
          ['a', { id: 'a', x: 60, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 180, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 240,
        height: 200,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('returns empty for fewer than 2 groups', () => {
      const spec: GraphSpec = {
        nodes: [{ id: 'a', label: 'A', width: 50, height: 50 }],
        edges: [],
        groups: [{ id: 'gA', label: 'A', children: ['a'] }],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['gA', { id: 'gA', x: 100, y: 100, width: 100, height: 100 }],
          ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 200,
        height: 200,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });
  });

  // ── fix ───────────────────────────────────────────────────────────

  describe('fix', () => {
    it('moves connected groups adjacent to each other', () => {
      const { spec, layout } = makeThreeGroups();
      const fixed = rule.fix(layout, spec);

      const gA = fixed.nodes.get('gA')!;
      const gB = fixed.nodes.get('gB')!;
      const gC = fixed.nodes.get('gC')!;

      // gA and gC should now be adjacent (distance between their centres
      // should be less than before — before: 320, after: ~120).
      const distAC = Math.abs(gA.x - gC.x);
      expect(distAC).toBeLessThan(200);

      // gB (unconnected) should be at the rightmost position
      expect(gB.x).toBeGreaterThan(gA.x);
      expect(gB.x).toBeGreaterThan(gC.x);
    });

    it('moves children along with their group', () => {
      const { spec, layout } = makeThreeGroups();
      const fixed = rule.fix(layout, spec);

      // a1 should stay at the centre of gA
      const gA = fixed.nodes.get('gA')!;
      const a1 = fixed.nodes.get('a1')!;
      expect(Math.abs(a1.x - gA.x)).toBeLessThan(1);

      // c1 should stay at the centre of gC
      const gC = fixed.nodes.get('gC')!;
      const c1 = fixed.nodes.get('c1')!;
      expect(Math.abs(c1.x - gC.x)).toBeLessThan(1);
    });

    it('does not mutate the original layout', () => {
      const { spec, layout } = makeThreeGroups();
      const origAx = layout.nodes.get('gA')!.x;
      rule.fix(layout, spec);
      expect(layout.nodes.get('gA')!.x).toBe(origAx);
    });

    it('preserves edge data', () => {
      const { spec, layout } = makeThreeGroups();
      const fixed = rule.fix(layout, spec);
      expect(fixed.edges).toHaveLength(1);
    });

    it('handles the prod-account scenario: 3 groups with mixed connectivity', () => {
      // Simulates: prod-infra (large, connected), replay (medium, isolated),
      // cross-account (small, connected)
      const spec: GraphSpec = {
        nodes: [
          { id: 'vpc', label: 'VPC', width: 50, height: 50 },
          { id: 'subnet', label: 'Subnet', width: 50, height: 50 },
          { id: 'replay', label: 'Replay', width: 50, height: 50 },
          { id: 'peering', label: 'Peering', width: 50, height: 50 },
          { id: 'lattice', label: 'Lattice', width: 50, height: 50 },
        ],
        edges: [
          { id: 'e1', source: 'subnet', target: 'peering' },
          { id: 'e2', source: 'lattice', target: 'vpc' },
        ],
        groups: [
          { id: 'prod', label: 'prod-infra', children: ['vpc', 'subnet'] },
          { id: 'rep', label: 'replay', children: ['replay'] },
          { id: 'cross', label: 'Cross-Account', children: ['peering', 'lattice'] },
        ],
      };
      // Current bad order: [prod, rep, cross] — rep separates connected pair
      const layout: LayoutResult = {
        nodes: new Map([
          ['prod', { id: 'prod', x: 200, y: 100, width: 300, height: 100 }],
          ['rep', { id: 'rep', x: 500, y: 100, width: 150, height: 100 }],
          ['cross', { id: 'cross', x: 720, y: 100, width: 120, height: 100 }],
          ['vpc', { id: 'vpc', x: 150, y: 100, width: 50, height: 50 }],
          ['subnet', { id: 'subnet', x: 250, y: 100, width: 50, height: 50 }],
          ['replay', { id: 'replay', x: 500, y: 100, width: 50, height: 50 }],
          ['peering', { id: 'peering', x: 690, y: 100, width: 50, height: 50 }],
          ['lattice', { id: 'lattice', x: 750, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 800,
        height: 200,
      };

      const fixed = rule.fix(layout, spec);
      const cross = fixed.nodes.get('cross')!;
      const prod = fixed.nodes.get('prod')!;
      const rep = fixed.nodes.get('rep')!;

      // cross-account and prod should be directly adjacent (no group between them)
      const crossRight = cross.x + cross.width / 2;
      const prodLeft = prod.x - prod.width / 2;
      const crossProdGap = Math.abs(
        cross.x < prod.x ? prodLeft - crossRight : (cross.x - cross.width / 2) - (prod.x + prod.width / 2),
      );
      expect(crossProdGap).toBeLessThanOrEqual(21); // gap=20 (default)

      // replay (unconnected) should be rightmost
      expect(rep.x).toBeGreaterThan(cross.x);
      expect(rep.x).toBeGreaterThan(prod.x);
    });

    it('prefers smaller connected groups on the left', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        groups: [
          { id: 'gBig', label: 'Big', children: ['a'] },
          { id: 'gSmall', label: 'Small', children: ['b'] },
        ],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          // Current order: big first, small second
          ['gBig', { id: 'gBig', x: 200, y: 100, width: 300, height: 100 }],
          ['gSmall', { id: 'gSmall', x: 450, y: 100, width: 100, height: 100 }],
          ['a', { id: 'a', x: 200, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 450, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 500,
        height: 200,
      };
      const fixed = rule.fix(layout, spec);
      // Small connected group should be on the left
      expect(fixed.nodes.get('gSmall')!.x).toBeLessThan(
        fixed.nodes.get('gBig')!.x,
      );
    });

    it('returns layout unchanged with fewer than 2 groups', () => {
      const spec: GraphSpec = {
        nodes: [{ id: 'a', label: 'A', width: 50, height: 50 }],
        edges: [],
        groups: [{ id: 'gA', label: 'A', children: ['a'] }],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['gA', { id: 'gA', x: 100, y: 100, width: 100, height: 100 }],
          ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 200,
        height: 200,
      };
      const fixed = rule.fix(layout, spec);
      expect(fixed.nodes.get('gA')!.x).toBe(100);
    });
  });
});
