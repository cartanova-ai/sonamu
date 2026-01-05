import { Checkbox, Tooltip, TooltipContent, TooltipTrigger } from "@sonamu-kit/react-components";
import type { SetStateAction } from "react";
import type { FixtureRecord } from "sonamu";
import InfoIcon from "~icons/lucide/info";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import TriangleAlertIcon from "~icons/lucide/triangle-alert";

type EntityTableProps = {
  fixtures: FixtureRecord[];
  onRelationToggle: (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean,
  ) => void;
  selectedIds: Set<string>;
  setFixtureRecords: (value: SetStateAction<FixtureRecord[]>) => void;
  isGraphNode?: boolean;
};

/**
 * FixtureRecord 배열을 받아 하나의 엔티티 테이블을 렌더링하는 공통 컴포넌트
 *
 * 중복 표시 구조:
 * - record.target: 사용자 지정 컬럼 기준 중복 레코드
 * - record.unique: unique index 기준 중복 레코드
 *
 * 중복 처리 옵션:
 * - override: 기존 레코드 덮어쓰기
 */
export default function EntityTable({
  fixtures,
  onRelationToggle,
  selectedIds,
  setFixtureRecords,
  isGraphNode = false,
}: EntityTableProps) {
  // 컬럼 목록에서 'id'를 제외하는 헬퍼 함수
  const refineColumns = (columns: Record<string, unknown>) => {
    return Object.entries(columns).filter(([c]) => c !== "id");
  };

  /**
   * 레코드의 행 수 계산 (target, unique 포함)
   */
  const getRowSpan = (record: FixtureRecord): number => {
    let rowSpan = 1;
    if (record.target) rowSpan++;
    if (record.unique) rowSpan++;
    return rowSpan;
  };

  /**
   * 중복 상태 확인
   */
  const hasDuplicate = (record: FixtureRecord): boolean => {
    return !!(record.target || record.unique);
  };

  /**
   * override 토글 핸들러
   */
  const handleOverrideToggle = (fixtureId: string) => {
    setFixtureRecords((prev) =>
      prev.map((r) => (r.fixtureId === fixtureId ? { ...r, override: !r.override } : r)),
    );
  };

  if (!fixtures || fixtures.length === 0) {
    return null;
  }

  const entityId = fixtures[0].entityId;
  const firstRecord = fixtures[0];

  return (
    <table className="ui celled structured table entity-table" key={entityId}>
      {isGraphNode && <strong className="table-node-header">{entityId}</strong>}
      <thead>
        {!isGraphNode && (
          <tr>
            <th colSpan={Object.keys(firstRecord.columns).length + 2}>{entityId}</th>
          </tr>
        )}
        <tr>
          <th className="collapsing">ID</th>
          <th className="collapsing">DB</th>
          {refineColumns(firstRecord.columns).map(([key]) => (
            <th key={key} className="collapsing">
              {key}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fixtures.map((record) => (
          <>
            {/* Source Row */}
            <tr key={record.id} className={record.unique ? "unique-violated" : ""}>
              <td className="collapsing" rowSpan={getRowSpan(record)}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>{record.id}</span>

                  {/* 중복이 있을 때만 옵션 버튼 표시 */}
                  {hasDuplicate(record) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                      {/* Override 버튼 */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={isGraphNode ? "nodrag nopan" : ""}
                            style={{
                              cursor: "pointer",
                              padding: "4px",
                              background: "none",
                              border: "none",
                            }}
                            onClick={() => handleOverrideToggle(record.fixtureId)}
                          >
                            <RefreshCwIcon
                              style={{
                                color: record.override ? "#10b981" : "#9ca3af",
                                width: "16px",
                                height: "16px",
                              }}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>덮어쓰기 (기존 레코드 업데이트)</TooltipContent>
                      </Tooltip>
                    </div>
                  )}

                  {/* Unique index 위반 표시 */}
                  {record.unique && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span style={{ cursor: "help" }}>
                          <TriangleAlertIcon
                            style={{ color: "#eab308", width: "16px", height: "16px" }}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Unique Index 위반 (ID: {record.unique.id})</TooltipContent>
                    </Tooltip>
                  )}

                  {/* 사용자 지정 컬럼 중복 표시 */}
                  {record.target && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span style={{ cursor: "help" }}>
                          <InfoIcon style={{ color: "#3b82f6", width: "16px", height: "16px" }} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        사용자 지정 컬럼 기준 중복 (ID: {record.target.id})
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </td>

              <td className="collapsing">source</td>
              {refineColumns(record.columns).map(([key, columnData]) => {
                const { prop, value } = columnData as {
                  prop: { type: string; relationType?: string; with?: string };
                  value: unknown;
                };
                return (
                  <td key={key} className="collapsing">
                    <div className="scrollable-cell-content">
                      {(Array.isArray(value) ? value : [value]).map((v, index) =>
                        prop.type === "relation" && prop.relationType !== "BelongsToOne" ? (
                          <div key={index}>
                            {JSON.stringify(v)}
                            {v !== null && prop.with && (
                              <Checkbox
                                className={isGraphNode ? "nodrag nopan" : ""}
                                checked={selectedIds.has(`${prop.with}#${v}`)}
                                onCheckedChange={(checked) => {
                                  onRelationToggle(
                                    record.fixtureId,
                                    prop.with as string,
                                    v as number,
                                    checked as boolean,
                                  );
                                }}
                              />
                            )}
                          </div>
                        ) : (
                          <span key={index}>{JSON.stringify(v)}</span>
                        ),
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Target Row (사용자 지정 컬럼 기준 중복) */}
            {record.target && (
              <tr key={`${record.id}-target`} className="warning">
                <td className="collapsing">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>target</span>
                    </TooltipTrigger>
                    <TooltipContent>사용자 지정 컬럼 기준 중복</TooltipContent>
                  </Tooltip>
                </td>
                {refineColumns(record.target.columns).map(([key, columnData]) => {
                  const { value } = columnData as { value: unknown };
                  return (
                    <td key={key} className="collapsing">
                      <div className="scrollable-cell-content">{JSON.stringify(value)}</div>
                    </td>
                  );
                })}
              </tr>
            )}

            {/* Unique Row (unique index 기준 중복) */}
            {record.unique && (
              <tr key={`${record.id}-unique`} className="negative">
                <td className="collapsing">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>unique</span>
                    </TooltipTrigger>
                    <TooltipContent>Unique Index 기준 중복</TooltipContent>
                  </Tooltip>
                </td>
                {refineColumns(record.unique.columns).map(([key, columnData]) => {
                  const { value } = columnData as { value: unknown };
                  return (
                    <td key={key} className="collapsing">
                      <div className="scrollable-cell-content">{JSON.stringify(value)}</div>
                    </td>
                  );
                })}
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  );
}
