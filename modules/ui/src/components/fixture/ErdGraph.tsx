import { SetStateAction, useEffect, useMemo } from "react";
import {
  ConnectionLineType,
  Edge,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./graph.scss";
import TableNode, {
  type TableNodeRFNode,
} from "../../components/fixture/TableNode";
import { FixtureRecord } from "sonamu";
import { groupBy } from "lodash";
import { TableEdge } from "./TableEdge";
import dagre from "@dagrejs/dagre";

type FixtureGraphProps = {
  fixtures: FixtureRecord[];
  selectedIds: Set<string>;
  onRelationToggle: (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean
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
  setFixtureRecords: FixtureGraphProps["setFixtureRecords"]
): TableNodeRFNode[] {
  const groupedFixtures = groupBy(fixtures, "entityId");

  const nodes: TableNodeRFNode[] = Object.entries(groupedFixtures).map(
    ([entityId, entityFixtures]) => ({
      id: entityId,
      type: "tableNode",
      position: { x: 0, y: 0 },
      data: {
        entityId,
        fixtures: entityFixtures,
        selectedIds,
        onRelationToggle,
        setFixtureRecords,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    })
  );

  return nodes;
}

/**
 * FixtureRecord 배열을 기반으로 React Flow 엣지 배열을 생성합니다.
 * FixtureRecord의 belongsRecords를 분석하여 관계(Belongs To)를 엣지로 표현합니다.
 */
function makeEdges(fixtures: FixtureRecord[]): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];

  for (const fixture of fixtures) {
    for (const targetFixtureId of fixture.belongsRecords) {
      const targetEntity = targetFixtureId.split("#")[0]; // "Entity#id" 형태이므로 #을 기준으로 엔티티 ID만 추출
      const source = fixture.entityId;
      const target = targetEntity;

      // 소스와 타겟이 같으면 건너뛰기
      if (source === target) continue;

      const key = `${source}->${target}`;
      // 이미 처리된 엣지(소스->타겟)는 건너뛰기
      if (seen.has(key)) continue;
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
 * dagre 라이브러리를 사용하여 노드와 엣지의 레이아웃을 계산합니다.
 * @returns 레이아웃이 적용된 노드와 엣지 배열
 */
function getLayoutedElements(
  nodes: TableNodeRFNode[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
) {
  const nodeWidth = 630;
  const baseNodeHeight = 100;

  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === "LR";

  dagreGraph.setGraph({ rankdir: direction });

  const getRowCount = (fixtures: FixtureRecord[]) =>
    fixtures.length +
    fixtures.filter((f) => f.target).length +
    fixtures.filter((f) => f.unique).length;

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
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    if (fixtures.length === 0) {
      return { nodes: [] as TableNodeRFNode[], edges: [] as Edge[] };
    }

    const nodes = makeNodes(
      fixtures,
      selectedIds,
      onRelationToggle,
      setFixtureRecords
    );
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
