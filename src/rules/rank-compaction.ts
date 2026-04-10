/**
 * Rank Compaction Rule
 *
 * Reduces excessive vertical (or horizontal) spacing between nodes
 * that Dagre's ranksep introduces. Pulls nodes toward each other
 * within groups, then compacts groups against each other, while
 * maintaining a configurable minimum readability gap.
 */

import type { LayoutResult, GraphSpec, LayoutRule, Violation, LayoutNode } from '../types.js';

export interface RankCompactionOptions {
  /** Minimum gap between node bounding boxes in pixels (default: 15). */
  minGap?: number;
  /** Threshold multiplier — gaps exceeding minGap * threshold trigger a violation (default: 3). */
  threshold?: number;
  /** Padding between group edge and contained nodes (default: 30). */
  groupPadding?: number;
}

export class RankCompactionRule implements LayoutRule {
  id = 'rank-compaction';
  description = 'Compact vertical spacing between ranks to reduce wasted whitespace';
  severity = 'info' as const;
  private minGap: number;
  private threshold: number;
  private groupPadding: number;

  constructor(options?: RankCompactionOptions) {
    this.minGap = options?.minGap ?? 15;
    this.threshold = options?.threshold ?? 3;
    this.groupPadding = options?.groupPadding ?? 30;
  }

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const maxGap = this.minGap * this.threshold;

    for (const group of spec.groups ?? []) {
      const children = sortedChildren(group.children, layout);
      if (children.length < 2) continue;

      for (let i = 1; i < children.length; i++) {
        const gap = verticalGap(children[i - 1], children[i]);
        if (gap > maxGap) {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            message: `Excessive gap (${Math.round(gap)}px) between "${children[i - 1].id}" and "${children[i].id}" in group "${group.id}" (max: ${maxGap}px)`,
            affectedElements: [children[i - 1].id, children[i].id],
          });
        }
      }
    }

    return violations;
  }

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);

    // Phase 1: Compact nodes within each group
    for (const group of spec.groups ?? []) {
      const children = sortedChildren(group.children, result);
      if (children.length < 2) continue;

      for (let i = 1; i < children.length; i++) {
        const gap = verticalGap(children[i - 1], children[i]);
        if (gap > this.minGap) {
          const shift = gap - this.minGap;
          // Shift this node and all nodes below it in this group
          for (let j = i; j < children.length; j++) {
            children[j].y -= shift;
          }
        }
      }

      // Phase 2: Recalculate group bounds
      this.fitGroupToChildren(result, group);
    }

    // Phase 3: Compact groups against each other
    const groups = (spec.groups ?? [])
      .map((g) => ({ spec: g, node: result.nodes.get(g.id) }))
      .filter((g): g is { spec: typeof g.spec; node: LayoutNode } => g.node !== undefined)
      .sort((a, b) => a.node.y - b.node.y);

    for (let i = 1; i < groups.length; i++) {
      const prev = groups[i - 1].node;
      const curr = groups[i].node;
      const gap = verticalGap(prev, curr);

      if (gap > this.minGap) {
        const shift = gap - this.minGap;
        // Shift group and all its children
        curr.y -= shift;
        for (const childId of groups[i].spec.children) {
          const child = result.nodes.get(childId);
          if (child) child.y -= shift;
        }
        // Also shift all subsequent groups
        for (let j = i + 1; j < groups.length; j++) {
          groups[j].node.y -= shift;
          for (const childId of groups[j].spec.children) {
            const child = result.nodes.get(childId);
            if (child) child.y -= shift;
          }
        }
      }
    }

    // Phase 4: Recalculate total diagram dimensions
    let maxRight = 0;
    let maxBottom = 0;
    for (const [, node] of result.nodes) {
      maxRight = Math.max(maxRight, node.x + node.width / 2);
      maxBottom = Math.max(maxBottom, node.y + node.height / 2);
    }
    result.width = maxRight + this.groupPadding;
    result.height = maxBottom + this.groupPadding;

    return result;
  }

  private fitGroupToChildren(layout: LayoutResult, group: { id: string; children: string[] }): void {
    const groupNode = layout.nodes.get(group.id);
    if (!groupNode) return;

    const children = group.children
      .map((id) => layout.nodes.get(id))
      .filter((n): n is LayoutNode => n !== undefined);
    if (children.length === 0) return;

    const pad = this.groupPadding;
    const minX = Math.min(...children.map((c) => c.x - c.width / 2)) - pad;
    const maxX = Math.max(...children.map((c) => c.x + c.width / 2)) + pad;
    const minY = Math.min(...children.map((c) => c.y - c.height / 2)) - pad;
    const maxY = Math.max(...children.map((c) => c.y + c.height / 2)) + pad;

    groupNode.width = maxX - minX;
    groupNode.height = maxY - minY;
    groupNode.x = minX + groupNode.width / 2;
    groupNode.y = minY + groupNode.height / 2;
  }
}

function verticalGap(above: LayoutNode, below: LayoutNode): number {
  const aboveBottom = above.y + above.height / 2;
  const belowTop = below.y - below.height / 2;
  return belowTop - aboveBottom;
}

function sortedChildren(childIds: string[], layout: LayoutResult): LayoutNode[] {
  return childIds
    .map((id) => layout.nodes.get(id))
    .filter((n): n is LayoutNode => n !== undefined)
    .sort((a, b) => a.y - b.y);
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
