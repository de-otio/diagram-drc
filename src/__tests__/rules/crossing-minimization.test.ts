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
});
