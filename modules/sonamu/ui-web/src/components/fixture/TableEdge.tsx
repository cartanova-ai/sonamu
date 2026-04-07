import { BaseEdge, getSmoothStepPath } from "@xyflow/react";
import { type EdgeProps } from "@xyflow/react";

export function TableEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return <BaseEdge id={id} path={path} style={{ strokeWidth: 1 }} />;
}
