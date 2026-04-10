import { CrossingMinimizationRule } from '../../rules/crossing-minimization.js';
import type { LayoutResult, GraphSpec } from '../../types.js';

const rule = new CrossingMinimizationRule();

describe('CrossingMinimizationRule', () => {
  it('detects no crossings in a clean layout', () => {
    const spec: GraphSpec = {
      nodes: [
        { id: 'a', label: 'A', width: 50, height: 50 },
        { id: 'b', label: 'B', width: 50, height: 50 },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    };
    const layout: LayoutResult = {
      nodes: new Map([
        ['a', { id: 'a', x: 100, y: 100, width: 50, height: 50 }],
        ['b', { id: 'b', x: 100, y: 200, width: 50, height: 50 }],
      ]),
      edges: [{ source: 'a', target: 'b', points: [] }],
      width: 200,
      height: 300,
    };

    expect(rule.check(layout, spec)).toHaveLength(0);
  });

  it('detects crossing edges', () => {
    // Two edges that cross: a→d and c→b
    const spec: GraphSpec = {
      nodes: [
        { id: 'a', label: 'A', width: 10, height: 10 },
        { id: 'b', label: 'B', width: 10, height: 10 },
        { id: 'c', label: 'C', width: 10, height: 10 },
        { id: 'd', label: 'D', width: 10, height: 10 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'd' },
        { id: 'e2', source: 'c', target: 'b' },
      ],
    };
    const layout: LayoutResult = {
      nodes: new Map([
        ['a', { id: 'a', x: 0, y: 0, width: 10, height: 10 }],
        ['b', { id: 'b', x: 100, y: 0, width: 10, height: 10 }],
        ['c', { id: 'c', x: 0, y: 100, width: 10, height: 10 }],
        ['d', { id: 'd', x: 100, y: 100, width: 10, height: 10 }],
      ]),
      edges: [],
      width: 110,
      height: 110,
    };

    const violations = rule.check(layout, spec);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('detects no crossings for parallel (non-intersecting) edges', () => {
    // Horizontal edges at different y-levels — they run parallel and never cross
    const parallelSpec: GraphSpec = {
      nodes: [
        { id: 'a', label: 'A', width: 10, height: 10 },
        { id: 'b', label: 'B', width: 10, height: 10 },
        { id: 'c', label: 'C', width: 10, height: 10 },
        { id: 'd', label: 'D', width: 10, height: 10 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' }, // (0,0)→(100,0)
        { id: 'e2', source: 'c', target: 'd' }, // (0,100)→(100,100)
      ],
    };
    const parallelLayout: LayoutResult = {
      nodes: new Map([
        ['a', { id: 'a', x: 0, y: 0, width: 10, height: 10 }],
        ['b', { id: 'b', x: 100, y: 0, width: 10, height: 10 }],
        ['c', { id: 'c', x: 0, y: 100, width: 10, height: 10 }],
        ['d', { id: 'd', x: 100, y: 100, width: 10, height: 10 }],
      ]),
      edges: [],
      width: 110,
      height: 110,
    };
    expect(rule.check(parallelLayout, parallelSpec)).toHaveLength(0);
  });

  it('reorders nodes to reduce crossings', () => {
    // VPN has cross-group edge to CGW on the left, should be placed left
    const spec: GraphSpec = {
      nodes: [
        { id: 'vpc', label: 'VPC', width: 50, height: 50 },
        { id: 'vpn', label: 'VPN', width: 50, height: 50 },
        { id: 'cgw', label: 'CGW', width: 50, height: 50 },
      ],
      edges: [
        { id: 'e1', source: 'vpn', target: 'cgw' },
      ],
      groups: [
        { id: 'g1', label: 'Group', children: ['vpc', 'vpn'] },
        { id: 'g2', label: 'External', children: ['cgw'] },
      ],
    };
    const layout: LayoutResult = {
      nodes: new Map([
        ['g1', { id: 'g1', x: 300, y: 200, width: 200, height: 200 }],
        ['g2', { id: 'g2', x: 50, y: 200, width: 100, height: 100 }],
        // VPN starts on the right (far from CGW)
        ['vpc', { id: 'vpc', x: 250, y: 150, width: 50, height: 50 }],
        ['vpn', { id: 'vpn', x: 350, y: 150, width: 50, height: 50 }],
        ['cgw', { id: 'cgw', x: 50, y: 200, width: 50, height: 50 }],
      ]),
      edges: [],
      width: 400,
      height: 300,
    };

    const fixed = rule.fix(layout, spec);
    const vpnX = fixed.nodes.get('vpn')!.x;
    const vpcX = fixed.nodes.get('vpc')!.x;
    // VPN should now be to the left of VPC (closer to CGW)
    expect(vpnX).toBeLessThan(vpcX);
  });

  it('preserves edge points when cloning layout during fix', () => {
    const spec: GraphSpec = {
      nodes: [
        { id: 'vpc', label: 'VPC', width: 50, height: 50 },
        { id: 'vpn', label: 'VPN', width: 50, height: 50 },
        { id: 'cgw', label: 'CGW', width: 50, height: 50 },
      ],
      edges: [{ id: 'e1', source: 'vpn', target: 'cgw' }],
      groups: [
        { id: 'g1', label: 'Group', children: ['vpc', 'vpn'] },
        { id: 'g2', label: 'External', children: ['cgw'] },
      ],
    };
    const layout: LayoutResult = {
      nodes: new Map([
        ['g1', { id: 'g1', x: 300, y: 200, width: 200, height: 200 }],
        ['g2', { id: 'g2', x: 50, y: 200, width: 100, height: 100 }],
        ['vpc', { id: 'vpc', x: 250, y: 150, width: 50, height: 50 }],
        ['vpn', { id: 'vpn', x: 350, y: 150, width: 50, height: 50 }],
        ['cgw', { id: 'cgw', x: 50, y: 200, width: 50, height: 50 }],
      ]),
      edges: [{ source: 'vpn', target: 'cgw', points: [{ x: 200, y: 175 }] }],
      width: 400,
      height: 300,
    };
    const fixed = rule.fix(layout, spec);
    expect(fixed.edges[0].points).toHaveLength(1);
    expect(fixed.edges[0].points[0]).toEqual({ x: 200, y: 175 });
  });

  it('handles multiple ranks within a group (nodes at different y values)', () => {
    // Three nodes: n1 and n2 at y=100, n3 at y=300 — two distinct ranks
    const spec: GraphSpec = {
      nodes: [
        { id: 'n1', label: 'N1', width: 50, height: 50 },
        { id: 'n2', label: 'N2', width: 50, height: 50 },
        { id: 'n3', label: 'N3', width: 50, height: 50 },
        { id: 'ext', label: 'Ext', width: 50, height: 50 },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'ext' }],
      groups: [{ id: 'g1', label: 'Group', children: ['n1', 'n2', 'n3'] }],
    };
    const layout: LayoutResult = {
      nodes: new Map([
        ['g1', { id: 'g1', x: 200, y: 300, width: 300, height: 400 }],
        ['n1', { id: 'n1', x: 250, y: 100, width: 50, height: 50 }],
        ['n2', { id: 'n2', x: 150, y: 100, width: 50, height: 50 }],
        ['n3', { id: 'n3', x: 200, y: 300, width: 50, height: 50 }], // >30px below n1/n2
        ['ext', { id: 'ext', x: 50, y: 100, width: 50, height: 50 }],
      ]),
      edges: [],
      width: 500,
      height: 500,
    };
    // Should not throw; nodes must be unchanged in count
    const fixed = rule.fix(layout, spec);
    expect(fixed.nodes.size).toBe(layout.nodes.size);
  });

  it('sorts rank nodes with mixed barycenters (some with cross-edges, some without)', () => {
    // n1 has no external edge (null barycenter), n2 has external edge to far-left ext
    const spec: GraphSpec = {
      nodes: [
        { id: 'n1', label: 'N1', width: 50, height: 50 },
        { id: 'n2', label: 'N2', width: 50, height: 50 },
        { id: 'ext', label: 'Ext', width: 50, height: 50 },
      ],
      edges: [{ id: 'e1', source: 'n2', target: 'ext' }],
      groups: [{ id: 'g1', label: 'Group', children: ['n1', 'n2'] }],
    };
    const layout: LayoutResult = {
      nodes: new Map([
        ['g1', { id: 'g1', x: 250, y: 200, width: 300, height: 200 }],
        // n1 starts on the left, n2 on the right — but n2's target is far left
        ['n1', { id: 'n1', x: 150, y: 200, width: 50, height: 50 }],
        ['n2', { id: 'n2', x: 350, y: 200, width: 50, height: 50 }],
        ['ext', { id: 'ext', x: 50, y: 200, width: 50, height: 50 }],
      ]),
      edges: [],
      width: 500,
      height: 400,
    };
    const fixed = rule.fix(layout, spec);
    // n2 (barycenter = 50) should get the smaller x slot
    expect(fixed.nodes.get('n2')!.x).toBeLessThan(fixed.nodes.get('n1')!.x);
  });
});
