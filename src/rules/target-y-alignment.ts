/**
 * Target Y-Alignment Rule
 *
 * Positions cross-group nodes in small groups so that:
 *  1. The topmost node is y-aligned with its anchor in the adjacent
 *     group (producing a horizontal edge).
 *  2. Remaining nodes are placed with compact vertical spacing below,
 *     sorted by their anchor's y — this guarantees no X-crossing
 *     while keeping the group small.
 *  3. Nodes are spread diagonally (x proportional to y-rank) so that
 *     edges fan out and don't share the same x-column.
 *
 * Only nodes in the SMALLER group are moved.
 */

import type {
  LayoutResult,
  GraphSpec,
  GraphGroup,
  LayoutRule,
  Violation,
  LayoutNode,
} from '../types.js';

export interface TargetYAlignmentOptions {
  /** Vertical spacing between successive cross-group nodes (default 50). */
  compactSpacing?: number;
  /** x-spread per unit of y-span (default 2.5). */
  xRatio?: number;
  /** Distance threshold for reporting a violation (default 40px). */
  threshold?: number;
}

export class TargetYAlignmentRule implements LayoutRule {
  id = 'target-y-alignment';
  description =
    'Align cross-group nodes vertically with their connection targets';
  severity = 'info' as const;

  private compactSpacing: number;
  private xRatio: number;
  private threshold: number;

  constructor(options?: TargetYAlignmentOptions) {
    this.compactSpacing = options?.compactSpacing ?? 50;
    this.xRatio = options?.xRatio ?? 2.5;
    this.threshold = options?.threshold ?? 40;
  }

  // ── check ───────────────────────────────────────────────────────────

  check(layout: LayoutResult, spec: GraphSpec): Violation[] {
    const violations: Violation[] = [];
    const seen = new Set<string>();
    const groups = spec.groups ?? [];
    const nodeGroup = buildNodeGroupMap(groups);

    for (const edge of spec.edges) {
      const srcGroup = nodeGroup.get(edge.source);
      const tgtGroup = nodeGroup.get(edge.target);
      if (!srcGroup || !tgtGroup || srcGroup.id === tgtGroup.id) continue;

      const [movableId, anchorId] = pickMovable(
        edge.source, srcGroup,
        edge.target, tgtGroup,
      );
      const movable = layout.nodes.get(movableId);
      const anchor = layout.nodes.get(anchorId);
      if (!movable || !anchor) continue;

      const delta = Math.abs(movable.y - anchor.y);
      if (delta > this.threshold && !seen.has(movableId)) {
        seen.add(movableId);
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message:
            `Node "${movableId}" is ${Math.round(delta)}px from the ` +
            `y-position of its cross-group target "${anchorId}"`,
          affectedElements: [movableId],
        });
      }
    }
    return violations;
  }

  // ── fix ─────────────────────────────────────────────────────────────

  fix(layout: LayoutResult, spec: GraphSpec): LayoutResult {
    const result = cloneLayout(layout);
    const groups = spec.groups ?? [];
    const nodeGroup = buildNodeGroupMap(groups);

    // Collect movable → anchor mapping, keyed by movable's group.
    const byGroup = new Map<
      string,
      { movableId: string; anchorY: number }[]
    >();

    for (const edge of spec.edges) {
      const srcGroup = nodeGroup.get(edge.source);
      const tgtGroup = nodeGroup.get(edge.target);
      if (!srcGroup || !tgtGroup || srcGroup.id === tgtGroup.id) continue;

      const [movableId, anchorId] = pickMovable(
        edge.source, srcGroup,
        edge.target, tgtGroup,
      );
      const anchor = result.nodes.get(anchorId);
      if (!anchor) continue;

      const mg = nodeGroup.get(movableId)!;
      let list = byGroup.get(mg.id);
      if (!list) {
        list = [];
        byGroup.set(mg.id, list);
      }
      // Deduplicate: if movableId already recorded, average the anchorY.
      const existing = list.find((e) => e.movableId === movableId);
      if (existing) {
        existing.anchorY = (existing.anchorY + anchor.y) / 2;
      } else {
        list.push({ movableId, anchorY: anchor.y });
      }
    }

    // Process each group.
    for (const group of groups) {
      const entries = byGroup.get(group.id);
      if (!entries || entries.length === 0) continue;

      // Sort by anchor y (ascending = highest on screen first).
      entries.sort((a, b) => a.anchorY - b.anchorY);

      // Phase 1 — Y: align first node with its anchor, stack rest compactly.
      const firstNode = result.nodes.get(entries[0].movableId)!;
      firstNode.y = entries[0].anchorY;
      for (let i = 1; i < entries.length; i++) {
        const node = result.nodes.get(entries[i].movableId)!;
        node.y = firstNode.y + i * this.compactSpacing;
      }

      // Phase 2 — X: diagonal spread, capped to available space.
      if (entries.length >= 2) {
        const groupNode = result.nodes.get(group.id);

        // Find the nearest group to the right.
        let nearestRightLeft = Infinity;
        if (groupNode) {
          for (const otherGroup of groups) {
            if (otherGroup.id === group.id) continue;
            const on = result.nodes.get(otherGroup.id);
            if (!on) continue;
            const ol = on.x - on.width / 2;
            if (ol > groupNode.x) nearestRightLeft = Math.min(nearestRightLeft, ol);
          }
        }

        const pad = 30;
        const minGap = 20;
        const nodeW = firstNode.width;
        const baseX = firstNode.x;

        // Cap spread so the rightmost node + padding stays left of neighbour.
        const ySpan = (entries.length - 1) * this.compactSpacing;
        let xSpread = ySpan * this.xRatio;
        if (nearestRightLeft < Infinity) {
          const maxRight = nearestRightLeft - minGap - pad - nodeW / 2;
          xSpread = Math.min(xSpread, Math.max(0, maxRight - baseX));
        }

        for (let i = 0; i < entries.length; i++) {
          const node = result.nodes.get(entries[i].movableId)!;
          const t = i / (entries.length - 1);
          node.x = baseX + t * xSpread;
        }
      }

      // Refit group envelope.
      fitGroup(result, group);
    }

    return result;
  }
}

// ── helpers ───────────────────────────────────────────────────────────

function pickMovable(
  srcId: string, srcGroup: GraphGroup,
  tgtId: string, tgtGroup: GraphGroup,
): [string, string] {
  if (srcGroup.children.length < tgtGroup.children.length) {
    return [srcId, tgtId];
  }
  if (tgtGroup.children.length < srcGroup.children.length) {
    return [tgtId, srcId];
  }
  return [tgtId, srcId];
}

function buildNodeGroupMap(groups: GraphGroup[]): Map<string, GraphGroup> {
  const m = new Map<string, GraphGroup>();
  for (const g of groups) {
    for (const c of g.children) m.set(c, g);
  }
  return m;
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
