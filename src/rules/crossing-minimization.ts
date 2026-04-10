/**
 * Crossing Minimization Rule
 *
 * Reorders nodes within each group rank using the barycenter heuristic
 * so that nodes with cross-group edges are placed on the side closest
 * to their external targets. This minimizes edge crossings.
 */

import type { LayoutResult, GraphSpec, LayoutRule, Violation, LayoutNode } from '../types.js';

export class CrossingMinimizationRule implements LayoutRule {
  id = 'crossing-minimization';
  description = 'Reorder sibling nodes within groups to minimize edge crossings';
  severity = 'warning' as const;

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const crossings = countCrossings(layout, spec);

    if (crossings.length > 0) {
      violations.push({
        ruleId: this.id,
        severity: this.severity,
        message: `${crossings.length} edge crossing(s) detected`,
        affectedElements: [...new Set(crossings.flatMap((c) => [c.edge1, c.edge2]))],
      });
    }

    return violations;
  }

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);
    reorderByBarycenter(spec, result);
    return result;
  }
}

/** Reorder nodes within each group rank by the barycenter of their cross-group neighbors. */
function reorderByBarycenter(spec: GraphSpec, result: LayoutResult): void {
  for (const group of spec.groups ?? []) {
    const groupNodes = group.children
      .map((id) => result.nodes.get(id))
      .filter((n): n is LayoutNode => !!n);

    if (groupNodes.length < 2) continue;

    // Cluster into ranks (similar y, within 30px)
    const sorted = [...groupNodes].sort((a, b) => a.y - b.y);
    const ranks: LayoutNode[][] = [];
    let currentRank: LayoutNode[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i].y - currentRank[0].y) < 30) {
        currentRank.push(sorted[i]);
      } else {
        ranks.push(currentRank);
        currentRank = [sorted[i]];
      }
    }
    ranks.push(currentRank);

    for (const rankNodes of ranks) {
      if (rankNodes.length < 2) continue;

      const barycenters = rankNodes.map((node) => {
        const crossTargets = spec.edges
          .filter((e) => e.source === node.id || e.target === node.id)
          .map((e) => (e.source === node.id ? e.target : e.source))
          .filter((tid) => !group.children.includes(tid))
          .map((tid) => result.nodes.get(tid))
          .filter((n): n is LayoutNode => !!n);

        if (crossTargets.length === 0) return null;
        return crossTargets.reduce((sum, t) => sum + t.x, 0) / crossTargets.length;
      });

      const xSlots = rankNodes.map((n) => n.x).sort((a, b) => a - b);
      const indexed = rankNodes.map((n, i) => ({ node: n, bc: barycenters[i] }));
      indexed.sort((a, b) => {
        if (a.bc !== null && b.bc !== null) return a.bc - b.bc;
        if (a.bc !== null) return -1;
        if (b.bc !== null) return 1;
        return a.node.x - b.node.x;
      });

      for (let i = 0; i < indexed.length; i++) {
        indexed[i].node.x = xSlots[i];
      }
    }
  }
}

interface Crossing {
  edge1: string;
  edge2: string;
}

/** Count pairwise edge crossings using segment intersection. */
function countCrossings(layout: LayoutResult, spec: GraphSpec): Crossing[] {
  const crossings: Crossing[] = [];
  const segments = spec.edges
    .map((e) => {
      const s = layout.nodes.get(e.source);
      const t = layout.nodes.get(e.target);
      if (!s || !t) return null;
      return { id: e.id, x1: s.x, y1: s.y, x2: t.x, y2: t.y };
    })
    .filter((s): s is NonNullable<typeof s> => !!s);

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      // Skip edges that share an endpoint
      if (a.x1 === b.x1 && a.y1 === b.y1) continue;
      if (a.x1 === b.x2 && a.y1 === b.y2) continue;
      if (a.x2 === b.x1 && a.y2 === b.y1) continue;
      if (a.x2 === b.x2 && a.y2 === b.y2) continue;

      if (segmentsIntersect(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) {
        crossings.push({ edge1: a.id, edge2: b.id });
      }
    }
  }

  return crossings;
}

/** Test if two line segments intersect using cross-product orientation. */
function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const d1 = direction(x3, y3, x4, y4, x1, y1);
  const d2 = direction(x3, y3, x4, y4, x2, y2);
  const d3 = direction(x1, y1, x2, y2, x3, y3);
  const d4 = direction(x1, y1, x2, y2, x4, y4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function direction(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function cloneLayout(layout: LayoutResult): LayoutResult {
  const nodes = new Map<string, LayoutNode>();
  for (const [id, node] of layout.nodes) {
    nodes.set(id, { ...node });
  }
  return {
    nodes,
    edges: layout.edges.map((e) => ({ ...e, points: e.points.map((p) => ({ ...p })) })),
    width: layout.width,
    height: layout.height,
  };
}
