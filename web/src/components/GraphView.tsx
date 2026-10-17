// I5: the workflow rendered from the API model (nodes/edges are the source of truth).

import { useEffect, useMemo } from 'react';
import {
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from '@xyflow/react';
import type { Workflow, WorkflowNode } from '@moon/shared';
import { Icon, stepIcon } from './icons.tsx';
import { layout } from '../layout.ts';

// Arrow heads match the edge stroke in styles.css.
const EDGE_STROKE = '#4a4a50';
// Condition outputs keep their stored label (true / false) but read as "oui" / "non" on screen.
const EDGE_TEXT: Record<string, string> = { true: 'oui', false: 'non' };
const TYPE_LABEL: Record<WorkflowNode['type'], string> = { trigger: 'déclencheur', action: 'action', condition: 'condition', end: 'fin' };

type StepData = { node: WorkflowNode; selected: boolean };
type StepNode = Node<StepData, 'step'>;

// n8n-style step: square icon tile, origin mark (✓ observed / dashed tile inferred), label underneath.
function StepCard({ data }: NodeProps<StepNode>) {
  const { node, selected } = data;
  const icon = stepIcon(node);
  const observed = node.origin === 'observed';
  return (
    <div className={`node2 node2-${node.type} ${observed ? 'is-observed' : 'is-inferred'} ${selected ? 'is-selected' : ''}`}>
      <div className="node2-tile" style={{ color: icon.color }} title={observed ? 'Observée dans Screenpipe' : 'Déduite par le modèle'}>
        <Handle type="target" position={Position.Left} />
        <Icon name={icon.name} size={24} />
        {observed && <span className="node2-check" aria-label="observée">✓</span>}
        <Handle type="source" position={Position.Right} />
      </div>
      <div className="node2-label">
        <div className="node2-title">{node.title}</div>
        <div className="node2-sub">{[node.app, TYPE_LABEL[node.type]].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

const nodeTypes = { step: StepCard };

interface Props {
  workflow: Workflow;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function GraphView(props: Props) {
  return (
    <ReactFlowProvider>
      <Graph {...props} />
    </ReactFlowProvider>
  );
}

function Graph({ workflow, selectedId, onSelect }: Props) {
  const { fitView } = useReactFlow();
  const positions = useMemo(() => layout(workflow.nodes, workflow.edges), [workflow.nodes, workflow.edges]);

  const nodes: StepNode[] = useMemo(
    () =>
      workflow.nodes.map((n) => ({
        id: n.id,
        type: 'step',
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: { node: n, selected: n.id === selectedId },
        draggable: false,
        // Size hint for the minimap (controlled nodes never get `measured` written back).
        initialWidth: 72,
        initialHeight: 72,
      })),
    [workflow.nodes, positions, selectedId],
  );

  const edges: Edge[] = useMemo(
    () =>
      workflow.edges.map((e) => {
        const kind = e.label?.toLowerCase() === 'true' ? 'true' : e.label?.toLowerCase() === 'false' ? 'false' : 'plain';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label ? (EDGE_TEXT[e.label.toLowerCase()] ?? e.label) : undefined,
          className: `edge-${kind}`,
          labelShowBg: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: EDGE_STROKE },
        };
      }),
    [workflow.edges],
  );

  // Re-centre when steps are added or removed (e.g. by MCP B), not on every poll.
  const shape = workflow.nodes.map((n) => n.id).join('|');
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [shape, fitView]);

  if (workflow.nodes.length === 0) {
    return <div className="empty">Ce workflow ne contient encore aucune étape.</div>;
  }

  return (
    <ReactFlow
      key={workflow.id}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      nodesConnectable={false}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Controls position="bottom-left" orientation="horizontal" showInteractive={false} />
    </ReactFlow>
  );
}
