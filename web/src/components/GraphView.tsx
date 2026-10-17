// I5: the workflow rendered from the API model (nodes/edges are the source of truth).

import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from '@xyflow/react';
import type { Workflow, WorkflowNode } from '@moon/shared';
import { appStyle } from '../apps.ts';
import { layout } from '../layout.ts';

type StepData = { node: WorkflowNode; selected: boolean };
type StepNode = Node<StepData, 'step'>;

function StepCard({ data }: NodeProps<StepNode>) {
  const { node, selected } = data;
  const app = appStyle(node.app);
  return (
    <div className={`step step-${node.type} ${selected ? 'is-selected' : ''} origin-${node.origin}`}>
      <Handle type="target" position={Position.Left} />
      <div className="step-icon" style={{ background: `${app.color}22`, color: app.color, borderColor: `${app.color}55` }}>
        {app.mark}
      </div>
      <div className="step-body">
        <div className="step-app">{node.app ?? (node.type === 'condition' ? 'Condition' : 'Étape')}</div>
        <div className="step-title">{node.title}</div>
        {node.description && <div className="step-desc">{node.description}</div>}
      </div>
      <span className={`origin-dot ${node.origin}`} title={node.origin === 'observed' ? 'Observée dans Screenpipe' : 'Inférée par le modèle'}>
        {node.origin === 'observed' ? 'obs.' : 'inf.'}
      </span>
      <Handle type="source" position={Position.Right} />
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
        initialWidth: 210,
        initialHeight: 64,
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
          label: e.label ?? undefined,
          className: `edge-${kind}`,
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 6,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        };
      }),
    [workflow.edges],
  );

  // Re-centre when steps are added or removed (e.g. by MCP B), not on every poll.
  const shape = workflow.nodes.map((n) => n.id).join('|');
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 60);
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
      <Background gap={22} size={1} color="#2a2850" />
      <Controls position="top-left" showInteractive={false} />
      <MiniMap position="bottom-left" pannable zoomable bgColor="#121130" nodeColor="#7c6cff" nodeBorderRadius={4} maskColor="rgba(8,8,24,0.55)" />
    </ReactFlow>
  );
}
