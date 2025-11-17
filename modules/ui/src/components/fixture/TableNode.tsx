import {
  Handle,
  Node,
  NodeProps,
  NodeResizeControl,
  Position,
} from "@xyflow/react";
import "./graph.scss";
import { FixtureRecord } from "sonamu";
import { SetStateAction } from "react";
import EntityTable from "../../components/fixture/EntityTable";

type TableNodeData = {
  entityId: string;
  fixtures: FixtureRecord[];
  onRelationToggle: (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean
  ) => void;
  selectedIds: Set<string>;
  setFixtureRecords: (value: SetStateAction<FixtureRecord[]>) => void;
};

export type TableNodeRFNode = Node<TableNodeData, "tableNode">;

export default function TableNode({ data, width }: NodeProps<TableNodeRFNode>) {
  const {
    entityId,
    fixtures,
    selectedIds,
    onRelationToggle,
    setFixtureRecords,
  } = data;

  return (
    <div
      className="table-node nowheel"
      style={width ? { width: `${width}px` } : { maxWidth: "630px" }}
    >
      <NodeResizeControl
        className="resize-control"
        position="right"
        style={{
          height: "100%",
          borderRadius: "0 4px 4px 0",
          backgroundColor: "rgba(0,100,255,0.1)",
          border: "solid rgba(0,100,255,0.4)",
          borderWidth: "0 1px 0 0",
        }}
      />

      <Handle
        type="target"
        position={Position.Top}
        id={entityId}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id={entityId}
        isConnectable={false}
      />
      <EntityTable
        fixtures={fixtures}
        selectedIds={selectedIds}
        onRelationToggle={onRelationToggle}
        setFixtureRecords={setFixtureRecords}
        isGraphNode={true}
      />
    </div>
  );
}
