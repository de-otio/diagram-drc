import { TargetYAlignmentRule } from '../../rules/target-y-alignment.js';
import type { LayoutResult, GraphSpec } from '../../types.js';

/**
 * Two groups side by side.  Small group (2 children) has cross-group
 * edges to a large group (4 children).  The small-group nodes are
 * stacked vertically at the same x — their y-values don't match the
 * targets in the large group, so the cross-group edges form an X.
 *
 *   small-group        large-group
 *     lattice ─── ─ ─ → vpc-prod   (y=300)
 *     peering ─── ─ ─ → subnet     (y=150)
 *
 * Currently lattice is ABOVE peering, so the edges cross.
 * After fix, lattice.y ≈ 300 and peering.y ≈ 150 — no crossing.
 */
function makeCrossGroupX(): { spec: GraphSpec; layout: LayoutResult } {
  const spec: GraphSpec = {
    nodes: [
      { id: 'lattice', label: 'Lattice', width: 50, height: 50 },
      { id: 'peering', label: 'Peering', width: 50, height: 50 },
      { id: 'vpc', label: 'VPC', width: 50, height: 50 },
      { id: 'subnet', label: 'Subnet', width: 50, height: 50 },
      { id: 'nat1', label: 'NAT1', width: 50, height: 50 },
      { id: 'nat2', label: 'NAT2', width: 50, height: 50 },
    ],
    edges: [
      { id: 'e1', source: 'lattice', target: 'vpc' },
      { id: 'e2', source: 'subnet', target: 'peering' },
    ],
    groups: [
      { id: 'gSmall', label: 'Cross-Account', children: ['lattice', 'peering'] },
      { id: 'gLarge', label: 'VPC', children: ['vpc', 'subnet', 'nat1', 'nat2'] },
    ],
  };
  const layout: LayoutResult = {
    nodes: new Map([
      ['gSmall', { id: 'gSmall', x: 100, y: 225, width: 150, height: 300 }],
      ['gLarge', { id: 'gLarge', x: 400, y: 225, width: 300, height: 300 }],
      // Small group: lattice ABOVE peering (wrong order for target y)
      ['lattice', { id: 'lattice', x: 100, y: 120, width: 50, height: 50 }],
      ['peering', { id: 'peering', x: 100, y: 280, width: 50, height: 50 }],
      // Large group: vpc at y=300, subnet at y=150
      ['vpc', { id: 'vpc', x: 350, y: 300, width: 50, height: 50 }],
      ['subnet', { id: 'subnet', x: 350, y: 150, width: 50, height: 50 }],
      ['nat1', { id: 'nat1', x: 450, y: 200, width: 50, height: 50 }],
      ['nat2', { id: 'nat2', x: 450, y: 300, width: 50, height: 50 }],
    ]),
    edges: [],
    width: 600,
    height: 400,
  };
  return { spec, layout };
}

describe('TargetYAlignmentRule', () => {
  const rule = new TargetYAlignmentRule();

  it('has id, description, and severity', () => {
    expect(rule.id).toBe('target-y-alignment');
    expect(rule.description).toBeTruthy();
    expect(rule.severity).toBe('info');
  });

  // ── check ─────────────────────────────────────────────────────────

  describe('check', () => {
    it('reports violations when cross-group nodes are y-misaligned', () => {
      const { spec, layout } = makeCrossGroupX();
      const violations = rule.check(layout, spec);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      // At least one of the small-group nodes should be flagged
      const ids = violations.map((v) => v.affectedElements[0]);
      expect(ids.some((id) => id === 'lattice' || id === 'peering')).toBe(true);
    });

    it('reports no violations when nodes are already y-aligned', () => {
      const { spec, layout } = makeCrossGroupX();
      // Align manually
      layout.nodes.get('lattice')!.y = 300; // matches vpc
      layout.nodes.get('peering')!.y = 150; // matches subnet
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('skips same-group edges', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 50, height: 50 },
          { id: 'b', label: 'B', width: 50, height: 50 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        groups: [{ id: 'g', label: 'G', children: ['a', 'b'] }],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['g', { id: 'g', x: 200, y: 200, width: 200, height: 200 }],
          ['a', { id: 'a', x: 150, y: 100, width: 50, height: 50 }],
          ['b', { id: 'b', x: 250, y: 300, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 400,
        height: 400,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });
  });

  // ── fix ───────────────────────────────────────────────────────────

  describe('fix', () => {
    it('aligns small-group nodes to their target y-positions', () => {
      const { spec, layout } = makeCrossGroupX();
      const fixed = rule.fix(layout, spec);

      const lattice = fixed.nodes.get('lattice')!;
      const peering = fixed.nodes.get('peering')!;

      // peering y-aligned with subnet.y=150
      expect(peering.y).toBeCloseTo(150, -1);
      // lattice compact-spaced below peering (~200), NOT at vpc.y=300
      expect(lattice.y).toBeCloseTo(200, -1);
      expect(lattice.y).toBeLessThan(250); // compact, not at target
    });

    it('eliminates the X-crossing of edges', () => {
      const { spec, layout } = makeCrossGroupX();
      const fixed = rule.fix(layout, spec);

      // After fix: lattice.y ≈ vpc.y=300, peering.y ≈ subnet.y=150
      // lattice is now BELOW peering — edges don't cross
      expect(fixed.nodes.get('lattice')!.y).toBeGreaterThan(
        fixed.nodes.get('peering')!.y,
      );
    });

    it('does not move nodes in the larger group', () => {
      const { spec, layout } = makeCrossGroupX();
      const fixed = rule.fix(layout, spec);

      expect(fixed.nodes.get('vpc')!.y).toBe(300);
      expect(fixed.nodes.get('subnet')!.y).toBe(150);
    });

    it('does not mutate the original layout', () => {
      const { spec, layout } = makeCrossGroupX();
      const origLatticeY = layout.nodes.get('lattice')!.y;
      rule.fix(layout, spec);
      expect(layout.nodes.get('lattice')!.y).toBe(origLatticeY);
    });

    it('refits the small group after moving children', () => {
      const { spec, layout } = makeCrossGroupX();
      const fixed = rule.fix(layout, spec);

      const gSmall = fixed.nodes.get('gSmall')!;
      const lattice = fixed.nodes.get('lattice')!;
      const peering = fixed.nodes.get('peering')!;

      // Both nodes should be inside the group bounds
      expect(lattice.y).toBeGreaterThanOrEqual(gSmall.y - gSmall.height / 2);
      expect(peering.y).toBeLessThanOrEqual(gSmall.y + gSmall.height / 2);
    });

    it('averages y when a node has multiple cross-group targets', () => {
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
          ['gA', { id: 'gA', x: 100, y: 200, width: 100, height: 100 }],
          ['gB', { id: 'gB', x: 400, y: 200, width: 200, height: 200 }],
          ['a', { id: 'a', x: 100, y: 200, width: 50, height: 50 }],
          ['b1', { id: 'b1', x: 350, y: 100, width: 50, height: 50 }],
          ['b2', { id: 'b2', x: 450, y: 300, width: 50, height: 50 }],
        ]),
        edges: [],
        width: 500,
        height: 400,
      };
      const fixed = rule.fix(layout, spec);
      // a should move toward average of b1.y=100 and b2.y=300 → 200
      expect(fixed.nodes.get('a')!.y).toBeCloseTo(200, -1);
    });
  });
});
