import {
  resolveNodeStyle,
  resolveEdgeStyle,
  resolveGroupStyle,
  DEFAULT_NODE_STYLE,
  DEFAULT_EDGE_STYLE,
  DEFAULT_GROUP_STYLE,
} from '../../render/styles.js';
import type { RenderStyles } from '../../render/styles.js';

describe('resolveNodeStyle', () => {
  it('returns DEFAULT_NODE_STYLE when styles is undefined', () => {
    expect(resolveNodeStyle(undefined)).toEqual(DEFAULT_NODE_STYLE);
  });

  it('returns DEFAULT_NODE_STYLE when type is undefined', () => {
    const styles: RenderStyles = {};
    expect(resolveNodeStyle(styles)).toEqual(DEFAULT_NODE_STYLE);
  });

  it('returns defaultNodeStyle from styles when type is not matched', () => {
    const custom = { ...DEFAULT_NODE_STYLE, fillColor: '#CUSTOM' };
    const styles: RenderStyles = { defaultNodeStyle: custom };
    expect(resolveNodeStyle(styles)).toEqual(custom);
  });

  it('returns type-specific style when type matches', () => {
    const typeStyle = { ...DEFAULT_NODE_STYLE, fillColor: '#FF0000' };
    const styles: RenderStyles = {
      nodeStyles: { database: typeStyle },
    };
    expect(resolveNodeStyle(styles, 'database')).toEqual(typeStyle);
  });

  it('falls back to defaultNodeStyle when type has no specific entry', () => {
    const fallback = { ...DEFAULT_NODE_STYLE, fillColor: '#FALLBACK' };
    const styles: RenderStyles = {
      nodeStyles: { database: { ...DEFAULT_NODE_STYLE, fillColor: '#DB' } },
      defaultNodeStyle: fallback,
    };
    expect(resolveNodeStyle(styles, 'unknown')).toEqual(fallback);
  });

  it('falls back to DEFAULT_NODE_STYLE when no defaultNodeStyle and type is unmatched', () => {
    const styles: RenderStyles = {
      nodeStyles: { database: { ...DEFAULT_NODE_STYLE } },
    };
    expect(resolveNodeStyle(styles, 'unknown')).toEqual(DEFAULT_NODE_STYLE);
  });
});

describe('resolveEdgeStyle', () => {
  it('returns DEFAULT_EDGE_STYLE when styles is undefined', () => {
    expect(resolveEdgeStyle(undefined)).toEqual(DEFAULT_EDGE_STYLE);
  });

  it('returns DEFAULT_EDGE_STYLE when type is undefined', () => {
    expect(resolveEdgeStyle({})).toEqual(DEFAULT_EDGE_STYLE);
  });

  it('returns defaultEdgeStyle from styles when type is not matched', () => {
    const custom = { ...DEFAULT_EDGE_STYLE, strokeColor: '#CUSTOM' };
    const styles: RenderStyles = { defaultEdgeStyle: custom };
    expect(resolveEdgeStyle(styles)).toEqual(custom);
  });

  it('returns type-specific style when type matches', () => {
    const typeStyle = { ...DEFAULT_EDGE_STYLE, strokeColor: '#FF0000', dashed: true };
    const styles: RenderStyles = {
      edgeStyles: { dependency: typeStyle },
    };
    expect(resolveEdgeStyle(styles, 'dependency')).toEqual(typeStyle);
  });

  it('falls back to defaultEdgeStyle when type has no specific entry', () => {
    const fallback = { ...DEFAULT_EDGE_STYLE, strokeWidth: 4 };
    const styles: RenderStyles = {
      edgeStyles: { dependency: { ...DEFAULT_EDGE_STYLE } },
      defaultEdgeStyle: fallback,
    };
    expect(resolveEdgeStyle(styles, 'unknown')).toEqual(fallback);
  });
});

describe('resolveGroupStyle', () => {
  it('returns DEFAULT_GROUP_STYLE when styles is undefined', () => {
    expect(resolveGroupStyle(undefined)).toEqual(DEFAULT_GROUP_STYLE);
  });

  it('returns DEFAULT_GROUP_STYLE when type is undefined', () => {
    expect(resolveGroupStyle({})).toEqual(DEFAULT_GROUP_STYLE);
  });

  it('returns defaultGroupStyle from styles when type is not matched', () => {
    const custom = { ...DEFAULT_GROUP_STYLE, fillColor: '#CUSTOM' };
    const styles: RenderStyles = { defaultGroupStyle: custom };
    expect(resolveGroupStyle(styles)).toEqual(custom);
  });

  it('returns type-specific style when type matches', () => {
    const typeStyle = { ...DEFAULT_GROUP_STYLE, fillColor: '#00FF00' };
    const styles: RenderStyles = {
      groupStyles: { vpc: typeStyle },
    };
    expect(resolveGroupStyle(styles, 'vpc')).toEqual(typeStyle);
  });

  it('falls back to defaultGroupStyle when type has no specific entry', () => {
    const fallback = { ...DEFAULT_GROUP_STYLE, strokeColor: '#FALLBACK' };
    const styles: RenderStyles = {
      groupStyles: { vpc: { ...DEFAULT_GROUP_STYLE } },
      defaultGroupStyle: fallback,
    };
    expect(resolveGroupStyle(styles, 'unknown')).toEqual(fallback);
  });
});

describe('default style constants', () => {
  it('DEFAULT_NODE_STYLE has expected shape', () => {
    expect(DEFAULT_NODE_STYLE.shape).toBeTruthy();
    expect(DEFAULT_NODE_STYLE.fillColor).toBeTruthy();
    expect(DEFAULT_NODE_STYLE.width).toBeGreaterThan(0);
    expect(DEFAULT_NODE_STYLE.height).toBeGreaterThan(0);
  });

  it('DEFAULT_EDGE_STYLE has expected properties', () => {
    expect(DEFAULT_EDGE_STYLE.strokeWidth).toBeGreaterThan(0);
    expect(typeof DEFAULT_EDGE_STYLE.dashed).toBe('boolean');
    expect(DEFAULT_EDGE_STYLE.endArrow).toBeTruthy();
  });

  it('DEFAULT_GROUP_STYLE has expected colors', () => {
    expect(DEFAULT_GROUP_STYLE.fillColor).toBeTruthy();
    expect(DEFAULT_GROUP_STYLE.strokeColor).toBeTruthy();
    expect(DEFAULT_GROUP_STYLE.fontColor).toBeTruthy();
  });
});
