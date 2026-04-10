/**
 * Renders a laid-out graph to draw.io mxGraph XML.
 *
 * Design:
 *  - Labels below icons (verticalLabelPosition=bottom)
 *  - HTML labels for formatted content
 *  - Node coordinates translated to parent-local when inside a group
 *  - Same-group edges: orthogonal with exit/entry constraints
 *  - Cross-group edges: smooth curves to avoid crossing siblings
 */

import type { LayoutResult, GraphSpec, LayoutNode } from '../types.js';
import type { RenderStyles } from './styles.js';
import { resolveNodeStyle, resolveEdgeStyle, resolveGroupStyle } from './styles.js';

export interface RenderOptions {
  styles?: RenderStyles;
  /** Title shown at the top of the diagram */
  title?: string;
  /** Subtitle shown below the title */
  subtitle?: string;
}

export function renderMxGraph(
  layout: LayoutResult,
  spec: GraphSpec,
  options?: RenderOptions,
): string {
  const styles = options?.styles;
  let cellId = 2;

  const groupCellMap = new Map<string, number>();
  const nodeCellMap = new Map<string, number>();

  // ── Group cells ───────────────────────────────────────────────────────────
  const groupCells: string[] = [];
  for (const group of spec.groups ?? []) {
    const layoutNode = layout.nodes.get(group.id);
    if (!layoutNode) continue;
    const gs = resolveGroupStyle(styles, group.metadata?.styleKey as string | undefined);
    const id = cellId++;
    groupCellMap.set(group.id, id);

    const gx = Math.round(layoutNode.x - layoutNode.width / 2);
    const gy = Math.round(layoutNode.y - layoutNode.height / 2);

    groupCells.push(
      `      <mxCell id="${id}" value="${esc(group.label)}" ` +
      `style="rounded=1;whiteSpace=wrap;html=1;` +
      `fillColor=${gs.fillColor};strokeColor=${gs.strokeColor};fontColor=${gs.fontColor};` +
      `fontSize=13;fontStyle=1;verticalAlign=top;align=center;spacingTop=8;` +
      `container=1;collapsible=0;swimlaneLine=0;arcSize=8;" ` +
      `vertex="1" parent="1">\n` +
      `        <mxGeometry x="${gx}" y="${gy}" ` +
      `width="${Math.round(layoutNode.width)}" height="${Math.round(layoutNode.height)}" as="geometry" />\n` +
      `      </mxCell>`,
    );
  }

  // ── Node cells ────────────────────────────────────────────────────────────
  const nodeCells: string[] = [];
  for (const node of spec.nodes) {
    const layoutNode = layout.nodes.get(node.id);
    if (!layoutNode) continue;
    const ns = resolveNodeStyle(styles, node.type);
    const id = cellId++;
    nodeCellMap.set(node.id, id);

    const parentGroup = (spec.groups ?? []).find((g) => g.children.includes(node.id));
    const parentCellId = parentGroup ? groupCellMap.get(parentGroup.id) ?? 1 : 1;

    let nodeX = layoutNode.x - ns.width / 2;
    let nodeY = layoutNode.y - ns.height / 2;
    if (parentGroup) {
      const groupLayout = layout.nodes.get(parentGroup.id);
      if (groupLayout) {
        nodeX -= (groupLayout.x - groupLayout.width / 2);
        nodeY -= (groupLayout.y - groupLayout.height / 2);
      }
    }

    nodeCells.push(
      `      <mxCell id="${id}" value="${esc(node.label)}" ` +
      `style="shape=${ns.shape};fillColor=${ns.fillColor};strokeColor=${ns.strokeColor};` +
      `fontColor=${ns.fontColor};fontSize=11;` +
      `verticalLabelPosition=bottom;verticalAlign=top;align=center;` +
      `html=1;whiteSpace=wrap;" ` +
      `vertex="1" parent="${parentCellId}">\n` +
      `        <mxGeometry x="${Math.round(nodeX)}" y="${Math.round(nodeY)}" ` +
      `width="${ns.width}" height="${ns.height}" as="geometry" />\n` +
      `      </mxCell>`,
    );
  }

  // ── Edge cells ────────────────────────────────────────────────────────────
  const edgeCells: string[] = [];
  for (const edge of spec.edges) {
    const sourceCellId = nodeCellMap.get(edge.source);
    const targetCellId = nodeCellMap.get(edge.target);
    if (sourceCellId === undefined || targetCellId === undefined) continue;

    const es = resolveEdgeStyle(styles, edge.type);
    const id = cellId++;

    const dashStr = es.dashed ? 'dashed=1;dashPattern=8 4;' : '';
    const label = edge.label ?? '';

    const sourceLayout = layout.nodes.get(edge.source);
    const targetLayout = layout.nodes.get(edge.target);
    const sourceGroup = (spec.groups ?? []).find((g) => g.children.includes(edge.source));
    const targetGroup = (spec.groups ?? []).find((g) => g.children.includes(edge.target));
    const sameGroup = !!(sourceGroup && targetGroup && sourceGroup.id === targetGroup.id);

    let edgeStyleStr: string;
    if (sameGroup && sourceLayout && targetLayout) {
      const constraints = computeEdgeConstraints(sourceLayout, targetLayout);
      edgeStyleStr = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;html=1;${constraints}`;
    } else {
      edgeStyleStr = `curved=1;rounded=1;html=1;`;
    }

    edgeCells.push(
      `      <mxCell id="${id}" value="${esc(label)}" ` +
      `style="${edgeStyleStr}` +
      `strokeColor=${es.strokeColor};strokeWidth=${es.strokeWidth};${dashStr}` +
      `endArrow=${es.endArrow};endFill=1;` +
      `fontSize=10;fontColor=#546E7A;labelBackgroundColor=#FFFFFF;" ` +
      `edge="1" source="${sourceCellId}" target="${targetCellId}" parent="1">\n` +
      `        <mxGeometry relative="1" as="geometry" />\n` +
      `      </mxCell>`,
    );
  }

  // ── Title cell ────────────────────────────────────────────────────────────
  let titleCell = '';
  if (options?.title) {
    const titleId = cellId++;
    const titleText = options.subtitle
      ? `<b>${esc(options.title)}</b><br><font style="font-size:11px;color:#78909C;">${esc(options.subtitle)}</font>`
      : `<b>${esc(options.title)}</b>`;
    titleCell =
      `      <mxCell id="${titleId}" value="${esc(titleText)}" ` +
      `style="text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;` +
      `fontSize=18;fontColor=#1A237E;" ` +
      `vertex="1" parent="1">\n` +
      `        <mxGeometry x="${Math.round(layout.width / 2 - 250)}" y="5" width="500" height="50" as="geometry" />\n` +
      `      </mxCell>`;
  }

  return [
    `<mxfile>`,
    `  <diagram name="${esc(options?.title ?? 'Diagram')}">`,
    `    <mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" math="0" shadow="0">`,
    `      <root>`,
    `      <mxCell id="0" />`,
    `      <mxCell id="1" parent="0" />`,
    ...(titleCell ? [titleCell] : []),
    ...groupCells,
    ...nodeCells,
    ...edgeCells,
    `      </root>`,
    `    </mxGraphModel>`,
    `  </diagram>`,
    `</mxfile>`,
  ].join('\n');
}

function computeEdgeConstraints(
  source: LayoutNode,
  target: LayoutNode,
): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy > 0
      ? 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;'
      : 'exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;';
  }
  return dx > 0
    ? 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;'
    : 'exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;';
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
