/**
 * Group Snap Rule
 *
 * Final-pass rule that enforces a minimum gap between adjacent groups.
 * Snaps each group's right edge to exactly minGap from its right
 * neighbour, eliminating both overlaps and excessive spacing.
 *
 * Must run late in the pipeline — after all rules that might shift
 * nodes (spacing, edge-node-overlap) have finished.
 */

import type {
  LayoutResult,
  GraphSpec,
  GraphGroup,
  LayoutRule,
  Violation,
  LayoutNode,
} from '../types.js';

export interface GroupSnapOptions {
  /** Desired gap between adjacent groups (default 20). */
  gap?: number;
}

export class GroupSnapRule implements LayoutRule {
  id = 'group-snap';
  description = 'Snap adjacent groups to a consistent gap';
  severity = 'info' as const;

  private gap: number;

  constructor(options?: GroupSnapOptions) {
    this.gap = options?.gap ?? 20;
  }

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const pairs = adjacentPairs(layout, spec);

    for (const [leftG, rightG] of pairs) {
      const leftNode = layout.nodes.get(leftG.id);
      const rightNode = layout.nodes.get(rightG.id);
      if (!leftNode || !rightNode) continue;

      const leftRight = leftNode.x + leftNode.width / 2;
      const rightLeft = rightNode.x - rightNode.width / 2;
      const actual = rightLeft - leftRight;

      if (Math.abs(actual - this.gap) > 5) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message:
            `Gap between "${leftG.id}" and "${rightG.id}" is ` +
            `${Math.round(actual)}px (target: ${this.gap}px)`,
          affectedElements: [leftG.id, rightG.id],
        });
      }
    }
    return violations;
  }

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);
    const groups = spec.groups ?? [];

    // Refit all groups first so bounds are current.
    for (const group of groups) fitGroup(result, group);

    // Sort groups left-to-right.
    const sorted = groups
      .map((g) => ({ spec: g, node: result.nodes.get(g.id)! }))
      .filter((g) => g.node)
      .sort((a, b) => a.node.x - b.node.x);

    // Snap each group to exactly `gap` from its right neighbour.
    // Work right-to-left: anchor the rightmost group, shift others.
    for (let i = sorted.length - 2; i >= 0; i--) {
      const leftNode = sorted[i].node;
      const rightNode = sorted[i + 1].node;
      const leftRight = leftNode.x + leftNode.width / 2;
      const rightLeft = rightNode.x - rightNode.width / 2;
      const actual = rightLeft - leftRight;
      const shift = actual - this.gap;

      if (Math.abs(shift) > 1) {
        leftNode.x += shift;
        for (const childId of sorted[i].spec.children) {
          const child = result.nodes.get(childId);
          if (child) child.x += shift;
        }
      }
    }

    return result;
  }
}

// ── helpers ───────────────────────────────────────────────────────────

function adjacentPairs(
  layout: LayoutResult,
  spec: GraphSpec,
): [GraphGroup, GraphGroup][] {
  const groups = (spec.groups ?? [])
    .map((g) => ({ spec: g, node: layout.nodes.get(g.id) }))
    .filter((g) => g.node)
    .sort((a, b) => a.node!.x - b.node!.x);

  const pairs: [GraphGroup, GraphGroup][] = [];
  for (let i = 0; i < groups.length - 1; i++) {
    pairs.push([groups[i].spec, groups[i + 1].spec]);
  }
  return pairs;
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
