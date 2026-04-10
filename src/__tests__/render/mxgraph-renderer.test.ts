import { renderMxGraph } from '../../render/mxgraph-renderer.js';
import { dagreLayout } from '../../layout/dagre-layout.js';
import type { GraphSpec, LayoutResult } from '../../types.js';

const spec: GraphSpec = {
  nodes: [
    { id: 'a', label: 'Node A', width: 48, height: 48 },
    { id: 'b', label: 'Node B', width: 48, height: 48 },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
  groups: [{ id: 'g1', label: 'Group 1', children: ['a', 'b'] }],
};

describe('renderMxGraph', () => {
  it('produces valid mxGraph XML', () => {
    const layout = dagreLayout(spec);
    const xml = renderMxGraph(layout, spec);
    expect(xml).toContain('<mxfile>');
    expect(xml).toContain('</mxfile>');
    expect(xml).toContain('<mxGraphModel ');
    expect(xml).toContain('</root>');
  });

  it('includes title when provided', () => {
    const layout = dagreLayout(spec);
    const xml = renderMxGraph(layout, spec, { title: 'Test Diagram' });
    expect(xml).toContain('Test Diagram');
  });

  it('renders group containers', () => {
    const layout = dagreLayout(spec);
    const xml = renderMxGraph(layout, spec);
    expect(xml).toContain('Group 1');
    expect(xml).toContain('container=1');
  });

  it('escapes special XML characters', () => {
    const escSpec: GraphSpec = {
      nodes: [{ id: 'x', label: 'A & B <C>', width: 48, height: 48 }],
      edges: [],
    };
    const layout = dagreLayout(escSpec);
    const xml = renderMxGraph(layout, escSpec);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).not.toContain('A & B');
  });

  it('handles empty graph', () => {
    const empty: GraphSpec = { nodes: [], edges: [] };
    const layout = dagreLayout(empty);
    const xml = renderMxGraph(layout, empty);
    expect(xml).toContain('<mxfile>');
    expect(xml).toContain('</mxfile>');
  });

  it('renders cross-group edges with curved style', () => {
    const crossGroupSpec: GraphSpec = {
      nodes: [
        { id: 'a', label: 'A', width: 48, height: 48 },
        { id: 'b', label: 'B', width: 48, height: 48 },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
      groups: [
        { id: 'g1', label: 'G1', children: ['a'] },
        { id: 'g2', label: 'G2', children: ['b'] },
      ],
    };
    const layout = dagreLayout(crossGroupSpec);
    const xml = renderMxGraph(layout, crossGroupSpec);
    expect(xml).toContain('curved=1');
  });

  it('renders same-group edges with horizontal constraints when nodes are side by side', () => {
    const horizontalSpec: GraphSpec = {
      nodes: [
        { id: 'a', label: 'A', width: 48, height: 48 },
        { id: 'b', label: 'B', width: 48, height: 48 },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
      groups: [{ id: 'g1', label: 'Group', children: ['a', 'b'] }],
    };
    // Manual layout: a and b side by side (large dx, small dy) inside the same group
    const horizontalLayout: LayoutResult = {
      nodes: new Map([
        ['g1', { id: 'g1', x: 200, y: 100, width: 400, height: 120 }],
        ['a', { id: 'a', x: 100, y: 100, width: 48, height: 48 }],
        ['b', { id: 'b', x: 300, y: 105, width: 48, height: 48 }], // dx=200 >> dy=5
      ]),
      edges: [],
      width: 500,
      height: 250,
    };
    const xml = renderMxGraph(horizontalLayout, horizontalSpec);
    // Horizontal edge constraints use exitX=1 or exitX=0
    expect(xml).toMatch(/exitX=[01];exitY=0\.5/);
  });

  it('renders title with subtitle', () => {
    const layout = dagreLayout(spec);
    const xml = renderMxGraph(layout, spec, { title: 'My Diagram', subtitle: 'Subtitle text' });
    expect(xml).toContain('My Diagram');
    expect(xml).toContain('Subtitle text');
  });

  it('renders edge labels', () => {
    const labelSpec: GraphSpec = {
      nodes: [
        { id: 'a', label: 'A', width: 48, height: 48 },
        { id: 'b', label: 'B', width: 48, height: 48 },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', label: 'calls' }],
    };
    const layout = dagreLayout(labelSpec);
    const xml = renderMxGraph(layout, labelSpec);
    expect(xml).toContain('calls');
  });

  it('renders with custom node type styles', () => {
    const typedSpec: GraphSpec = {
      nodes: [{ id: 'a', label: 'DB', width: 48, height: 48, type: 'database' }],
      edges: [],
    };
    const layout = dagreLayout(typedSpec);
    const xml = renderMxGraph(layout, typedSpec, {
      styles: {
        nodeStyles: {
          database: {
            shape: 'mxgraph.erd.entity',
            fillColor: '#DAE8FC',
            strokeColor: '#6C8EBF',
            fontColor: '#000000',
            width: 60,
            height: 60,
          },
        },
      },
    });
    expect(xml).toContain('mxgraph.erd.entity');
  });
});
