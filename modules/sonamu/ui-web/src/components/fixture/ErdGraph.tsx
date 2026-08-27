import dagre from "@dagrejs/dagre";
import {
  ConnectionLineType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { type Edge } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./graph.scss";
import { group } from "radashi";
import { useEffect, useMemo } from "react";
import { type SetStateAction } from "react";
import { type FixtureRecord } from "sonamu";

import TableNode from "../../components/fixture/TableNode";
import { type TableNodeRFNode } from "../../components/fixture/TableNode";
import { TableEdge } from "./TableEdge";

type FixtureGraphProps = {
  fixtures: FixtureRecord[];
  selectedIds: Set<string>;
  onRelationToggle: (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean,
  ) => void;
  setFixtureRecords: (value: SetStateAction<FixtureRecord[]>) => void;
};

/**
 * FixtureRecord 배열을 React Flow 노드 배열로 변환합니다.
 * 각 엔티티(entityId)별로 하나의 TableNode를 생성합니다.
 */
function makeNodes(
  fixtures: FixtureRecord[],
  selectedIds: Set<string>,
  onRelationToggle: FixtureGraphProps["onRelationToggle"],
  setFixtureRecords: FixtureGraphProps["setFixtureRecords"],
): TableNodeRFNode[] {
  const groupedFixtures = group(fixtures, (fixture) => fixture.entityId);

  const nodes: TableNodeRFNode[] = Object.entries(groupedFixtures).map(
    ([entityId, entityFixtures]) => ({
      id: entityId,
      type: "tableNode",
      position: { x: 0, y: 0 },
      data: {
        entityId,
        fixtures: entityFixtures ?? [],
        selectedIds,
        onRelationToggle,
        setFixtureRecords,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    }),
  );

  return nodes;
}

/**
 * FixtureRecord 배열을 기반으로 React Flow 엣지 배열을 생성합니다.
 * BelongsToOne relation 컬럼을 분석하여 관계를 엣지로 표현합니다.
 */
function makeEdges(fixtures: FixtureRecord[]): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const fixtureIds = new Set(fixtures.map((f) => f.fixtureId));

  for (const fixture of fixtures) {
    for (const [, col] of Object.entries(fixture.columns)) {
      if (col.prop.type !== "relation") continue;
      if (col.prop.relationType !== "BelongsToOne" && col.prop.relationType !== "OneToOne")
        continue;
      if (col.value === null) continue;

      const relatedEntityId = col.prop.with;
      const relatedFixtureId = `${relatedEntityId}#${col.value}`;

      // 관련 fixture가 현재 fixtures에 있는 경우에만 엣지 생성
      if (!fixtureIds.has(relatedFixtureId)) continue;

      const source = fixture.entityId;
      const target = relatedEntityId;

      if (source === target) continue;

      const key = `${source}->${target}`;
      const reverseKey = `${target}->${source}`;
      if (seen.has(key) || seen.has(reverseKey)) continue;
      seen.add(key);

      edges.push({
        id: key,
        source,
        target,
        type: "tableEdge",
      });
    }
  }

  return edges;
}

/**
 * 레코드별 행 수 계산 (target, unique 포함)
 */
function getRowCount(fixtures: FixtureRecord[]): number {
  return fixtures.reduce((count, f) => {
    let rows = 1; // source row
    if (f.target) rows++;
    if (f.unique) rows++;
    return count + rows;
  }, 0);
}

/**
 * dagre 라이브러리를 사용하여 노드와 엣지의 레이아웃을 계산합니다.
 */
function getLayoutedElements(
  nodes: TableNodeRFNode[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
) {
  const nodeWidth = 630;
  const baseNodeHeight = 100;

  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === "LR";

  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    const rowCount = getRowCount(node.data.fixtures);
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: baseNodeHeight + 40 * rowCount,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const rowCount = getRowCount(node.data.fixtures);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - (baseNodeHeight + 40 * rowCount) / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
}

export default function FixtureGraph({
  fixtures,
  selectedIds,
  onRelationToggle,
  setFixtureRecords,
}: FixtureGraphProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo<{
    nodes: TableNodeRFNode[];
    edges: Edge[];
  }>(() => {
    if (fixtures.length === 0) {
      return { nodes: [], edges: [] };
    }

    const nodes = makeNodes(fixtures, selectedIds, onRelationToggle, setFixtureRecords);
    const edges = makeEdges(fixtures);

    return getLayoutedElements(nodes, edges, "TB");
  }, [fixtures, selectedIds, onRelationToggle, setFixtureRecords]);

  const nodeTypes = useMemo(() => ({ tableNode: TableNode }), []);
  const edgeTypes = useMemo(() => ({ tableEdge: TableEdge }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutedEdges);
  }, [layoutedEdges, setEdges]);

  return (
    <div className="fixture-graph-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      />
    </div>
  );
}
