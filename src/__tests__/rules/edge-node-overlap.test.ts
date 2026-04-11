import { EdgeNodeOverlapRule } from '../../rules/edge-node-overlap.js';
import type { LayoutResult, GraphSpec } from '../../types.js';

/**
 * Three nodes in a row.  Edge a→c passes through b.
 *
 *   a ──────── b ──────── c
 *              ↑
 *         overlap here
 */
function makeOverlap(): { spec: GraphSpec; layout: LayoutResult } {
  const spec: GraphSpec = {
    nodes: [
      { id: 'a', label: 'A', width: 40, height: 40 },
      { id: 'b', label: 'B', width: 40, height: 40 },
      { id: 'c', label: 'C', width: 40, height: 40 },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'c' }],
    groups: [{ id: 'g', label: 'G', children: ['a', 'b', 'c'] }],
  };
  const layout: LayoutResult = {
    nodes: new Map([
      ['g', { id: 'g', x: 200, y: 100, width: 400, height: 100 }],
      ['a', { id: 'a', x: 50, y: 100, width: 40, height: 40 }],
      ['b', { id: 'b', x: 200, y: 100, width: 40, height: 40 }],
      ['c', { id: 'c', x: 350, y: 100, width: 40, height: 40 }],
    ]),
    edges: [{ source: 'a', target: 'c', points: [] }],
    width: 400,
    height: 200,
  };
  return { spec, layout };
}

describe('EdgeNodeOverlapRule', () => {
  const rule = new EdgeNodeOverlapRule();

  it('has id, description, and severity', () => {
    expect(rule.id).toBe('edge-node-overlap');
    expect(rule.description).toBeTruthy();
    expect(rule.severity).toBe('warning');
  });

  // ── check ─────────────────────────────────────────────────────────

  describe('check', () => {
    it('detects an edge passing through an unrelated node', () => {
      const { spec, layout } = makeOverlap();
      const violations = rule.check(layout, spec);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      const v = violations[0];
      expect(v.affectedElements).toContain('b');
      expect(v.message).toContain('b');
    });

    it('reports no overlaps when nodes are not in the edge path', () => {
      const { spec, layout } = makeOverlap();
      // Move b well out of the way
      layout.nodes.get('b')!.y = 300;
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('ignores source and target nodes of the edge', () => {
      // Edge a→c: a and c are endpoints — not overlaps
      const { spec, layout } = makeOverlap();
      const violations = rule.check(layout, spec);
      for (const v of violations) {
        // The reported "overlapped" node (3rd element) is never a/c
        const overlapped = v.affectedElements[2];
        expect(overlapped).not.toBe('a');
        expect(overlapped).not.toBe('c');
      }
    });

    it('ignores cross-group edges', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 40, height: 40 },
          { id: 'b', label: 'B', width: 40, height: 40 },
          { id: 'c', label: 'C', width: 40, height: 40 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'c' }],
        groups: [
          { id: 'g1', label: 'G1', children: ['a', 'b'] },
          { id: 'g2', label: 'G2', children: ['c'] },
        ],
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['g1', { id: 'g1', x: 150, y: 100, width: 300, height: 100 }],
          ['g2', { id: 'g2', x: 400, y: 100, width: 100, height: 100 }],
          ['a', { id: 'a', x: 50, y: 100, width: 40, height: 40 }],
          ['b', { id: 'b', x: 200, y: 100, width: 40, height: 40 }],
          ['c', { id: 'c', x: 400, y: 100, width: 40, height: 40 }],
        ]),
        edges: [],
        width: 500,
        height: 200,
      };
      // a→c is cross-group — b should NOT be flagged
      expect(rule.check(layout, spec)).toHaveLength(0);
    });

    it('reports no overlap for nodes without groups', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 40, height: 40 },
          { id: 'b', label: 'B', width: 40, height: 40 },
          { id: 'c', label: 'C', width: 40, height: 40 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'c' }],
        // no groups
      };
      const layout: LayoutResult = {
        nodes: new Map([
          ['a', { id: 'a', x: 50, y: 100, width: 40, height: 40 }],
          ['b', { id: 'b', x: 200, y: 100, width: 40, height: 40 }],
          ['c', { id: 'c', x: 350, y: 100, width: 40, height: 40 }],
        ]),
        edges: [],
        width: 400,
        height: 200,
      };
      expect(rule.check(layout, spec)).toHaveLength(0);
    });
  });

  // ── fix ───────────────────────────────────────────────────────────

  describe('fix', () => {
    it('nudges the crossed node for horizontal edges', () => {
      const { spec, layout } = makeOverlap();
      const fixed = rule.fix(layout, spec);

      const b = fixed.nodes.get('b')!;
      const origY = layout.nodes.get('b')!.y;
      // Horizontal edge a→c: b is nudged perpendicular (y changes)
      expect(b.y).not.toBeCloseTo(origY, 0);
    });

    it('does not mutate the original layout', () => {
      const { spec, layout } = makeOverlap();
      const origBY = layout.nodes.get('b')!.y;
      rule.fix(layout, spec);
      expect(layout.nodes.get('b')!.y).toBe(origBY);
    });

    it('preserves edge data', () => {
      const { spec, layout } = makeOverlap();
      const fixed = rule.fix(layout, spec);
      expect(fixed.edges).toHaveLength(1);
    });

    it('handles diagonal edges (nudges perpendicular)', () => {
      const spec: GraphSpec = {
        nodes: [
          { id: 'a', label: 'A', width: 40, height: 40 },
          { id: 'b', label: 'B', width: 40, height: 40 },
          { id: 'c', label: 'C', width: 40, height: 40 },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'c' }],
        groups: [{ id: 'g', label: 'G', children: ['a', 'b', 'c'] }],
      };
      // Diagonal edge: a at (50,50), c at (350,350), b at (200,200) — on the line
      const layout: LayoutResult = {
        nodes: new Map([
          ['g', { id: 'g', x: 200, y: 200, width: 400, height: 400 }],
          ['a', { id: 'a', x: 50, y: 50, width: 40, height: 40 }],
          ['b', { id: 'b', x: 200, y: 200, width: 40, height: 40 }],
          ['c', { id: 'c', x: 350, y: 350, width: 40, height: 40 }],
        ]),
        edges: [],
        width: 400,
        height: 400,
      };
      const fixed = rule.fix(layout, spec);
      const b = fixed.nodes.get('b')!;
      // b should have moved away from the diagonal
      const origDist = 0; // b was exactly on the line
      const newDist = Math.abs(
        (350 - 50) * (50 - b.y) - (50 - 50) * (b.x - 50),
      ) / Math.sqrt((350 - 50) ** 2 + (350 - 50) ** 2);
      expect(newDist).toBeGreaterThan(5);
    });

    it('returns layout unchanged when no overlaps exist', () => {
      const { spec, layout } = makeOverlap();
      layout.nodes.get('b')!.y = 300; // far away
      const fixed = rule.fix(layout, spec);
      expect(fixed.nodes.get('b')!.y).toBe(300);
    });
  });
});
