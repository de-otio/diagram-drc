/**
 * Group Proximity Rule
 *
 * Reorders side-by-side groups so that groups connected by cross-group
 * edges are placed adjacent to each other.  Uses an exhaustive
 * permutation search (≤ 8 groups) with a composite scoring function:
 *
 *   1. Primary — minimise total weighted cross-group edge length
 *   2. Secondary — push unconnected groups to the right (periphery)
 *   3. Tertiary — among connected groups, smaller ones go leftward
 *
 * Analogous to cell placement optimisation in IC P&R: reduce global
 * wirelength by choosing an optimal left-to-right ordering.
 */

import type {
  LayoutResult,
  GraphSpec,
  GraphGroup,
  LayoutRule,
  Violation,
  LayoutNode,
} from '../types.js';

export interface GroupProximityOptions {
  /** Horizontal gap between groups after reflow (default 20). */
  gap?: number;
}

export class GroupProximityRule implements LayoutRule {
  id = 'group-proximity';
  description = 'Reorder groups to minimise total cross-group edge length';
  severity = 'info' as const;

  private gap: number;

  constructor(options?: GroupProximityOptions) {
    this.gap = options?.gap ?? 20;
  }

  // ── check ───────────────────────────────────────────────────────────

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const analysis = this.analyze(layout, spec);
    if (!analysis) return [];

    const { currentEdgeLength, bestEdgeLength } = analysis;
    if (bestEdgeLength === 0) return [];
    if (currentEdgeLength > bestEdgeLength * 1.3) {
      const pct = Math.round(
        (1 - bestEdgeLength / currentEdgeLength) * 100,
      );
      return [
        {
          ruleId: this.id,
          severity: this.severity,
          message: `Reordering groups could reduce cross-group edge length by ${pct}%`,
          affectedElements: (spec.groups ?? []).map((g) => g.id),
        },
      ];
    }
    return [];
  }

  // ── fix ─────────────────────────────────────────────────────────────

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const analysis = this.analyze(layout, spec);
    if (!analysis) return layout;

    const result = cloneLayout(layout);
    const { bestOrder, groupInfos } = analysis;

    // Reflow groups left-to-right in the optimal order.
    const startX = Math.min(
      ...groupInfos.map((g) => g.node.x - g.node.width / 2),
    );
    let currentLeft = startX;

    for (const groupId of bestOrder) {
      const info = groupInfos.find((g) => g.spec.id === groupId)!;
      const node = result.nodes.get(groupId)!;
      const newCenter = currentLeft + node.width / 2;
      const dx = newCenter - node.x;

      node.x = newCenter;
      for (const childId of info.spec.children) {
        const child = result.nodes.get(childId);
        if (child) child.x += dx;
      }

      currentLeft += node.width + this.gap;
    }

    // Align all groups to the same top edge (single row) so that
    // cross-group edges are horizontal and don't cross intra-group nodes.
    const targetTop = Math.min(
      ...groupInfos.map((g) => {
        const n = result.nodes.get(g.spec.id)!;
        return n.y - n.height / 2;
      }),
    );
    for (const info of groupInfos) {
      const node = result.nodes.get(info.spec.id)!;
      const currentTop = node.y - node.height / 2;
      const dy = targetTop - currentTop;
      if (Math.abs(dy) < 1) continue;
      node.y += dy;
      for (const childId of info.spec.children) {
        const child = result.nodes.get(childId);
        if (child) child.y += dy;
      }
    }

    result.width = currentLeft - this.gap;
    return result;
  }

  // ── analysis (shared between check & fix) ──────────────────────────

  private analyze(layout: LayoutResult, spec: GraphSpec): Analysis | null {
    const groups = spec.groups ?? [];
    const groupInfos = groups
      .map((g) => ({ spec: g, node: layout.nodes.get(g.id)! }))
      .filter((g) => g.node)
      .sort((a, b) => a.node.x - b.node.x);

    if (groupInfos.length < 2) return null;

    const edgeCounts = buildEdgeCounts(spec);
    if (edgeCounts.size === 0) return null;

    const connectedness = buildConnectedness(groups, edgeCounts);
    const ids = groupInfos.map((g) => g.spec.id);
    const widths = new Map(groupInfos.map((g) => [g.spec.id, g.node.width]));

    // Current cross-group edge length.
    const currentCenters = new Map(
      groupInfos.map((g) => [g.spec.id, g.node.x]),
    );
    const currentEdgeLength = edgeLength(currentCenters, edgeCounts);

    // Best permutation.
    let bestOrder = ids;
    let bestScore = this.permScore(
      ids,
      widths,
      edgeCounts,
      connectedness,
    );

    // Exhaustive search for ≤ 8 groups (8! = 40 320).
    if (ids.length <= 8) {
      for (const perm of permutations(ids)) {
        const score = this.permScore(
          perm,
          widths,
          edgeCounts,
          connectedness,
        );
        if (score < bestScore) {
          bestScore = score;
          bestOrder = [...perm];
        }
      }
    }

    // Compute best edge length for comparison.
    const bestCenters = new Map<string, number>();
    let x = 0;
    for (const id of bestOrder) {
      const w = widths.get(id)!;
      bestCenters.set(id, x + w / 2);
      x += w + this.gap;
    }
    const bestEdgeLength = edgeLength(bestCenters, edgeCounts);

    return {
      bestOrder,
      bestEdgeLength,
      currentEdgeLength,
      groupInfos,
    };
  }

  /**
   * Composite permutation score.  Lower is better.
   *
   * The three tiers are scaled so that primary always dominates
   * secondary, which always dominates tertiary.
   */
  private permScore(
    order: string[],
    widths: Map<string, number>,
    edgeCounts: Map<string, number>,
    connectedness: Map<string, number>,
  ): number {
    // Compute centres for this particular ordering.
    const centers = new Map<string, number>();
    let x = 0;
    for (const id of order) {
      const w = widths.get(id)!;
      centers.set(id, x + w / 2);
      x += w + this.gap;
    }

    // Primary: total weighted cross-group edge length.
    const primary = edgeLength(centers, edgeCounts);

    // Secondary: unconnected groups should sit at the right (high index).
    // Penalty = distance from the rightmost slot.
    let secondary = 0;
    for (let i = 0; i < order.length; i++) {
      if ((connectedness.get(order[i]) ?? 0) === 0) {
        secondary += order.length - 1 - i;
      }
    }

    // Tertiary: among connected groups, put smaller ones leftward.
    // Penalise wide groups sitting at low indices (i.e. left).
    let tertiary = 0;
    for (let i = 0; i < order.length; i++) {
      if ((connectedness.get(order[i]) ?? 0) > 0) {
        tertiary += (order.length - 1 - i) * (widths.get(order[i]) ?? 0);
      }
    }

    return primary * 1e8 + secondary * 1e4 + tertiary;
  }
}

// ── module-private helpers ────────────────────────────────────────────

interface Analysis {
  bestOrder: string[];
  bestEdgeLength: number;
  currentEdgeLength: number;
  groupInfos: { spec: GraphGroup; node: LayoutNode }[];
}

/** Weighted cross-group edge length given group centres. */
function edgeLength(
  centers: Map<string, number>,
  edgeCounts: Map<string, number>,
): number {
  let total = 0;
  for (const [key, count] of edgeCounts) {
    const [a, b] = key.split('|');
    total +=
      Math.abs((centers.get(a) ?? 0) - (centers.get(b) ?? 0)) * count;
  }
  return total;
}

/**
 * Count cross-group edges between each pair of groups.
 * Keys are sorted `groupA|groupB` to avoid duplicates.
 */
function buildEdgeCounts(spec: GraphSpec): Map<string, number> {
  const groups = spec.groups ?? [];
  const nodeGroup = new Map<string, string>();
  for (const g of groups) {
    for (const c of g.children) nodeGroup.set(c, g.id);
  }

  const counts = new Map<string, number>();
  for (const edge of spec.edges) {
    const sg = nodeGroup.get(edge.source);
    const tg = nodeGroup.get(edge.target);
    if (!sg || !tg || sg === tg) continue;
    const key = [sg, tg].sort().join('|');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Number of distinct other groups each group is connected to. */
function buildConnectedness(
  groups: GraphGroup[],
  edgeCounts: Map<string, number>,
): Map<string, number> {
  const conn = new Map<string, Set<string>>();
  for (const g of groups) conn.set(g.id, new Set());

  for (const key of edgeCounts.keys()) {
    const [a, b] = key.split('|');
    conn.get(a)?.add(b);
    conn.get(b)?.add(a);
  }

  const result = new Map<string, number>();
  for (const [id, peers] of conn) result.set(id, peers.size);
  return result;
}

/** Yield all permutations of arr (Heap-style, non-recursive). */
function* permutations<T>(arr: T[]): Generator<T[]> {
  const a = [...arr];
  const n = a.length;
  const c = new Array<number>(n).fill(0);
  yield [...a];
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) {
        [a[0], a[i]] = [a[i], a[0]];
      } else {
        [a[c[i]], a[i]] = [a[i], a[c[i]]];
      }
      yield [...a];
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

function cloneLayout(layout: LayoutResult): LayoutResult {
  const nodes = new Map<string, LayoutNode>();
  for (const [id, node] of layout.nodes) {
    nodes.set(id, { ...node });
  }
  return {
    nodes,
    edges: layout.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ ...p })),
    })),
    width: layout.width,
    height: layout.height,
  };
}
