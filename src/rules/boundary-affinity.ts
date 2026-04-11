/**
 * Boundary Affinity Rule
 *
 * Pulls nodes with cross-group edges toward the side of their group
 * that faces the connected external group.  This shortens cross-group
 * edges and reduces crossings through unrelated groups — analogous to
 * port-side assignment in IC place-and-route.
 */

import type {
  LayoutResult,
  GraphSpec,
  GraphGroup,
  LayoutRule,
  Violation,
  LayoutNode,
} from '../types.js';

export interface BoundaryAffinityOptions {
  /** How strongly to pull nodes toward the boundary (0–1, default 0.8). */
  strength?: number;
  /** Minimum padding between node edge and group boundary (default 30). */
  padding?: number;
  /**
   * A node is violated when its distance from the ideal boundary
   * position exceeds this fraction of the group's width (default 0.3).
   */
  threshold?: number;
}

export class BoundaryAffinityRule implements LayoutRule {
  id = 'boundary-affinity';
  description =
    'Pull nodes with cross-group edges toward the group boundary facing the connected group';
  severity = 'info' as const;

  private strength: number;
  private padding: number;
  private threshold: number;

  constructor(options?: BoundaryAffinityOptions) {
    this.strength = options?.strength ?? 0.8;
    this.padding = options?.padding ?? 30;
    this.threshold = options?.threshold ?? 0.3;
  }

  // ── check ───────────────────────────────────────────────────────────

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const groups = spec.groups ?? [];
    const nodeToGroup = buildNodeGroupMap(groups);

    for (const edge of spec.edges) {
      const srcGroup = nodeToGroup.get(edge.source);
      const tgtGroup = nodeToGroup.get(edge.target);
      if (!srcGroup || !tgtGroup || srcGroup.id === tgtGroup.id) continue;

      const v1 = this.checkNode(edge.source, srcGroup, tgtGroup, layout);
      if (v1) violations.push(v1);

      const v2 = this.checkNode(edge.target, tgtGroup, srcGroup, layout);
      if (v2) violations.push(v2);
    }

    // Deduplicate — a node may appear in several cross-group edges.
    const seen = new Set<string>();
    return violations.filter((v) => {
      const key = v.affectedElements[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private checkNode(
    nodeId: string,
    ownGroup: GraphGroup,
    targetGroup: GraphGroup,
    layout: LayoutResult,
  ): Violation | null {
    const node = layout.nodes.get(nodeId);
    const ownGroupNode = layout.nodes.get(ownGroup.id);
    const targetGroupNode = layout.nodes.get(targetGroup.id);
    if (!node || !ownGroupNode || !targetGroupNode) return null;

    const ideal = this.idealX(node, ownGroupNode, targetGroupNode);
    if (ideal === null) return null; // groups stacked vertically — skip x check

    const distance = Math.abs(node.x - ideal);
    if (distance > ownGroupNode.width * this.threshold) {
      return {
        ruleId: this.id,
        severity: this.severity,
        message:
          `Node "${nodeId}" is ${Math.round(distance)}px from the ideal ` +
          `boundary position in group "${ownGroup.id}"`,
        affectedElements: [nodeId],
      };
    }
    return null;
  }

  // ── fix ─────────────────────────────────────────────────────────────

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);
    const groups = spec.groups ?? [];
    const nodeToGroup = buildNodeGroupMap(groups);

    // Accumulate pull targets per node (may have edges to several groups).
    const pulls = new Map<string, { totalX: number; count: number }>();

    for (const edge of spec.edges) {
      const srcGroup = nodeToGroup.get(edge.source);
      const tgtGroup = nodeToGroup.get(edge.target);
      if (!srcGroup || !tgtGroup || srcGroup.id === tgtGroup.id) continue;

      const srcNode = result.nodes.get(edge.source);
      const tgtNode = result.nodes.get(edge.target);
      const srcGroupNode = result.nodes.get(srcGroup.id);
      const tgtGroupNode = result.nodes.get(tgtGroup.id);
      if (!srcNode || !tgtNode || !srcGroupNode || !tgtGroupNode) continue;

      const srcIdeal = this.idealX(srcNode, srcGroupNode, tgtGroupNode);
      if (srcIdeal !== null) addPull(pulls, edge.source, srcIdeal);

      const tgtIdeal = this.idealX(tgtNode, tgtGroupNode, srcGroupNode);
      if (tgtIdeal !== null) addPull(pulls, edge.target, tgtIdeal);
    }

    // Apply weighted pulls.
    for (const [nodeId, pull] of pulls) {
      const node = result.nodes.get(nodeId);
      if (!node) continue;
      const targetX = pull.totalX / pull.count;
      node.x += (targetX - node.x) * this.strength;
    }

    // Refit group envelopes to updated child positions.
    for (const group of groups) {
      fitGroupToChildren(result, group, this.padding);
    }

    return result;
  }

  // ── helpers ─────────────────────────────────────────────────────────

  /**
   * Return the ideal x-centre for `node` inside `ownGroup`, given that
   * the connected group is `targetGroup`.  Returns null when the groups
   * are primarily stacked vertically (horizontal pull is not useful).
   */
  private idealX(
    node: LayoutNode,
    ownGroup: LayoutNode,
    targetGroup: LayoutNode,
  ): number | null {
    const dx = Math.abs(targetGroup.x - ownGroup.x);
    const dy = Math.abs(targetGroup.y - ownGroup.y);
    if (dx < dy * 0.5) return null; // mostly vertical separation

    if (targetGroup.x < ownGroup.x) {
      // target is to the LEFT → pull toward left edge
      return ownGroup.x - ownGroup.width / 2 + this.padding + node.width / 2;
    }
    // target is to the RIGHT → pull toward right edge
    return ownGroup.x + ownGroup.width / 2 - this.padding - node.width / 2;
  }
}

// ── module-private utilities ──────────────────────────────────────────

function buildNodeGroupMap(groups: GraphGroup[]): Map<string, GraphGroup> {
  const m = new Map<string, GraphGroup>();
  for (const g of groups) {
    for (const childId of g.children) {
      m.set(childId, g);
    }
  }
  return m;
}

function addPull(
  pulls: Map<string, { totalX: number; count: number }>,
  nodeId: string,
  targetX: number,
): void {
  const p = pulls.get(nodeId);
  if (p) {
    p.totalX += targetX;
    p.count++;
  } else {
    pulls.set(nodeId, { totalX: targetX, count: 1 });
  }
}

function fitGroupToChildren(
  layout: LayoutResult,
  group: GraphGroup,
  padding: number,
): void {
  const groupNode = layout.nodes.get(group.id);
  if (!groupNode) return;
  const children = group.children
    .map((id) => layout.nodes.get(id))
    .filter((n): n is LayoutNode => n !== undefined);
  if (children.length === 0) return;

  const minX = Math.min(...children.map((c) => c.x - c.width / 2)) - padding;
  const maxX = Math.max(...children.map((c) => c.x + c.width / 2)) + padding;
  const minY = Math.min(...children.map((c) => c.y - c.height / 2)) - padding;
  const maxY = Math.max(...children.map((c) => c.y + c.height / 2)) + padding;
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
