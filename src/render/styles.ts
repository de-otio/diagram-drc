/**
 * draw.io mxGraph visual style definitions.
 *
 * Styles are configurable — consumers provide their own style maps
 * keyed by node/edge/group type. Sensible defaults are included.
 */

export interface NodeStyle {
  shape: string;
  fillColor: string;
  strokeColor: string;
  fontColor: string;
  width: number;
  height: number;
}

export interface EdgeStyle {
  strokeColor: string;
  strokeWidth: number;
  dashed: boolean;
  endArrow: string;
}

export interface GroupStyle {
  fillColor: string;
  strokeColor: string;
  fontColor: string;
}

export interface RenderStyles {
  nodeStyles?: Record<string, NodeStyle>;
  edgeStyles?: Record<string, EdgeStyle>;
  groupStyles?: Record<string, GroupStyle>;
  defaultNodeStyle?: NodeStyle;
  defaultEdgeStyle?: EdgeStyle;
  defaultGroupStyle?: GroupStyle;
}

export const DEFAULT_NODE_STYLE: NodeStyle = {
  shape: 'rounded=1',
  fillColor: '#ECEFF1',
  strokeColor: '#607D8B',
  fontColor: '#37474F',
  width: 48,
  height: 48,
};

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  strokeColor: '#607D8B',
  strokeWidth: 2,
  dashed: false,
  endArrow: 'classic',
};

export const DEFAULT_GROUP_STYLE: GroupStyle = {
  fillColor: '#F5F5F5',
  strokeColor: '#BDBDBD',
  fontColor: '#424242',
};

export function resolveNodeStyle(styles: RenderStyles | undefined, type?: string): NodeStyle {
  if (type && styles?.nodeStyles?.[type]) return styles.nodeStyles[type];
  return styles?.defaultNodeStyle ?? DEFAULT_NODE_STYLE;
}

export function resolveEdgeStyle(styles: RenderStyles | undefined, type?: string): EdgeStyle {
  if (type && styles?.edgeStyles?.[type]) return styles.edgeStyles[type];
  return styles?.defaultEdgeStyle ?? DEFAULT_EDGE_STYLE;
}

export function resolveGroupStyle(styles: RenderStyles | undefined, type?: string): GroupStyle {
  if (type && styles?.groupStyles?.[type]) return styles.groupStyles[type];
  return styles?.defaultGroupStyle ?? DEFAULT_GROUP_STYLE;
}
