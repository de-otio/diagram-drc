# diagram-drc

Design Rule Check engine for auto-generated diagrams.

Just as IC layout tools run DRC to catch spacing violations and routing issues in silicon, `diagram-drc` runs quality checks on graph layouts and can auto-fix violations.

## Features

- **Check mode** — detect layout quality issues without modifying the diagram
- **Fix mode** — automatically resolve violations (crossing minimization, spacing, etc.)
- **Pluggable rules** — built-in rules for common issues, easy to add your own
- **Format-agnostic core** — works with any graph representation
- **draw.io renderer** — render layouts to mxGraph XML (draw.io format)
- **Dagre layout** — built-in wrapper for the Dagre directed graph layout engine

## Quick start

```bash
npm install diagram-drc
```

```typescript
import { createEngine, builtinRules, dagreLayout, renderMxGraph } from 'diagram-drc';

// Define your graph
const spec = {
  nodes: [
    { id: 'a', label: 'Service A', width: 48, height: 48 },
    { id: 'b', label: 'Service B', width: 48, height: 48 },
    { id: 'c', label: 'Database',  width: 48, height: 48 },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'c' },
    { id: 'e2', source: 'b', target: 'c' },
  ],
  groups: [
    { id: 'g1', label: 'Backend', children: ['a', 'b'] },
    { id: 'g2', label: 'Data',    children: ['c'] },
  ],
};

// Layout with Dagre
const layout = dagreLayout(spec);

// Run DRC — check for issues
const engine = createEngine({ rules: builtinRules() });
const report = engine.check(layout, spec);
console.log(report.passed ? 'All checks passed' : `${report.violations.length} violation(s)`);

// Or fix issues automatically
const { layout: fixed, report: fixReport } = engine.fix(layout, spec);

// Render to draw.io
const xml = renderMxGraph(fixed, spec, { title: 'Architecture' });
```

## Built-in rules

| Rule | Description |
|------|-------------|
| `crossing-minimization` | Reorders sibling nodes within groups to minimize edge crossings |
| `spacing` | Ensures minimum distance between node bounding boxes |

## Writing custom rules

```typescript
import type { LayoutRule, LayoutResult, GraphSpec, Violation } from 'diagram-drc';

const myRule: LayoutRule = {
  id: 'my-custom-rule',
  description: 'Check something specific to my diagrams',
  severity: 'warning',
  check(layout, spec) {
    // Return violations found
    return [];
  },
  fix(layout, spec) {
    // Return corrected layout
    return layout;
  },
};

engine.addRule(myRule);
```

## API

### Engine

- `createEngine(options?)` — create a DRC engine
- `engine.check(layout, spec)` — detect violations (read-only)
- `engine.fix(layout, spec)` — fix violations and report remaining issues
- `engine.addRule(rule)` — add a rule (chainable)

### Layout

- `dagreLayout(spec, options?)` — run Dagre layout on a graph

### Render

- `renderMxGraph(layout, spec, options?)` — render to draw.io mxGraph XML

## License

MIT
