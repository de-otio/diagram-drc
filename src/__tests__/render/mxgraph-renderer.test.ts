import { renderMxGraph } from '../../render/mxgraph-renderer.js';
import { dagreLayout } from '../../layout/dagre-layout.js';
import type { GraphSpec } from '../../types.js';

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
});
