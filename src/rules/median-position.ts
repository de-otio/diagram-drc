/**
 * Median Position Rule
 *
 * Repositions each node at the median x-coordinate of its intra-group
 * neighbours.  This is the core heuristic of the Sugiyama layered
 * graph-drawing framework: when a node sits at the median of its
 * connected peers, total edge length and edge crossings are minimised.
 *
 * Only intra-group edges are considered — cross-group connectivity is
 * handled by boundary-affinity, which runs after this rule.
 */

import type {
  LayoutResult,
  GraphSpec,
  GraphGroup,
  LayoutRule,
  Violation,
  LayoutNode,
} from '../types.js';

export interface MedianPositionOptions {
  /** Pull strength per iteration (0–1, default 0.9). */
  strength?: number;
  /** Number of iterative passes (default 4). */
  iterations?: number;
  /**
   * A node is violated when its distance from the median exceeds this
   * fraction of the group width (default 0.15).
   */
  threshold?: number;
}

export class MedianPositionRule implements LayoutRule {
  id = 'median-position';
  description =
    'Position nodes at the median x of their intra-group neighbours';
  severity = 'warning' as const;

  private strength: number;
  private iterations: number;
  private threshold: number;

  constructor(options?: MedianPositionOptions) {
    this.strength = options?.strength ?? 0.9;
    this.iterations = options?.iterations ?? 4;
    this.threshold = options?.threshold ?? 0.15;
  }

  // ── check ───────────────────────────────────────────────────────────

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    for (const group of spec.groups ?? []) {
      const groupNode = layout.nodes.get(group.id);
      if (!groupNode) continue;
      const adj = intraGroupAdj(group, spec);

      for (const childId of group.children) {
        const node = layout.nodes.get(childId);
        if (!node) continue;
        const neighbors = adj.get(childId);
        if (!neighbors || neighbors.length === 0) continue;

        const median = medianX(neighbors, layout);
        if (median === null) continue;
        const delta = Math.abs(node.x - median);

        if (delta > groupNode.width * this.threshold) {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            message:
              `Node "${childId}" is ${Math.round(delta)}px from the ` +
              `median of its neighbours in group "${group.id}"`,
            affectedElements: [childId],
          });
        }
      }
    }
    return violations;
  }

  // ── fix ─────────────────────────────────────────────────────────────

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);

    for (const group of spec.groups ?? []) {
      const adj = intraGroupAdj(group, spec);
      if (adj.size === 0) continue;

      for (let iter = 0; iter < this.iterations; iter++) {
        for (const childId of group.children) {
          const node = result.nodes.get(childId);
          if (!node) continue;
          const neighbors = adj.get(childId);
          if (!neighbors || neighbors.length === 0) continue;

          const median = medianX(neighbors, result);
          if (median === null) continue;
          node.x += (median - node.x) * this.strength;
        }
      }

      // Refit group envelope.
      fitGroup(result, group);
    }

    return result;
  }
}

// ── helpers ───────────────────────────────────────────────────────────

/**
 * Build an adjacency list containing only edges where BOTH endpoints
 * belong to the same group.
 */
function intraGroupAdj(
  group: GraphGroup,
  spec: GraphSpec,
): Map<string, string[]> {
  const members = new Set(group.children);
  const adj = new Map<string, string[]>();
  for (const c of group.children) adj.set(c, []);

  for (const edge of spec.edges) {
    if (members.has(edge.source) && members.has(edge.target)) {
      adj.get(edge.source)!.push(edge.target);
      adj.get(edge.target)!.push(edge.source);
    }
  }
  return adj;
}

/** Median x-position of a list of node ids. */
function medianX(
  ids: string[],
  layout: LayoutResult,
): number | null {
  const xs: number[] = [];
  for (const id of ids) {
    const n = layout.nodes.get(id);
    if (n) xs.push(n.x);
  }
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1
    ? xs[mid]
    : (xs[mid - 1] + xs[mid]) / 2;
}

function fitGroup(layout: LayoutResult, group: GraphGroup): void {
  const groupNode = layout.nodes.get(group.id);
  if (!groupNode) return;
  const children = group.children
    .map((id) => layout.nodes.get(id))
    .filter((n): n is LayoutNode => n !== undefined);
  if (children.length === 0) return;

  const pad = 30;
  const minX = Math.min(...children.map((c) => c.x - c.width / 2)) - pad;
  const maxX = Math.max(...children.map((c) => c.x + c.width / 2)) + pad;
  const minY = Math.min(...children.map((c) => c.y - c.height / 2)) - pad;
  const maxY = Math.max(...children.map((c) => c.y + c.height / 2)) + pad;
  groupNode.width = maxX - minX;
  groupNode.height = maxY - minY;
  groupNode.x = minX + groupNode.width / 2;
  groupNode.y = minY + groupNode.height / 2;
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
