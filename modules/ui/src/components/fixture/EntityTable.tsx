import type { SetStateAction } from "react";
import { Checkbox, Icon, Popup, Table } from "semantic-ui-react";
import type { FixtureRecord } from "sonamu";

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
    <Table celled structured className="entity-table" key={entityId}>
      {isGraphNode && <strong className="table-node-header">{entityId}</strong>}
      <Table.Header>
        {!isGraphNode && (
          <Table.Row>
            <Table.HeaderCell colSpan={Object.keys(firstRecord.columns).length + 2}>
              {entityId}
            </Table.HeaderCell>
          </Table.Row>
        )}
        <Table.Row>
          <Table.HeaderCell collapsing content="ID" />
          <Table.HeaderCell collapsing content="DB" />
          {refineColumns(firstRecord.columns).map(([key]) => (
            <Table.HeaderCell key={key} collapsing>
              {key}
            </Table.HeaderCell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {fixtures.map((record) => (
          <>
            {/* Source Row */}
            <Table.Row key={record.id} className={record.unique ? "unique-violated" : ""}>
              <Table.Cell collapsing rowSpan={getRowSpan(record)}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>{record.id}</span>

                  {/* 중복이 있을 때만 옵션 버튼 표시 */}
                  {hasDuplicate(record) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                      {/* Override 버튼 */}
                      <Popup
                        content="덮어쓰기 (기존 레코드 업데이트)"
                        position="top center"
                        trigger={
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
                            <Icon name="sync" color={record.override ? "green" : "grey"} />
                          </button>
                        }
                      />
                    </div>
                  )}

                  {/* Unique index 위반 표시 */}
                  {record.unique && (
                    <Popup
                      content={`Unique Index 위반 (ID: ${record.unique.id})`}
                      position="top center"
                      trigger={
                        <span style={{ cursor: "help" }}>
                          <Icon name="warning sign" color="yellow" />
                        </span>
                      }
                    />
                  )}

                  {/* 사용자 지정 컬럼 중복 표시 */}
                  {record.target && (
                    <Popup
                      content={`사용자 지정 컬럼 기준 중복 (ID: ${record.target.id})`}
                      position="top center"
                      trigger={
                        <span style={{ cursor: "help" }}>
                          <Icon name="info circle" color="blue" />
                        </span>
                      }
                    />
                  )}
                </div>
              </Table.Cell>

              <Table.Cell collapsing>source</Table.Cell>
              {refineColumns(record.columns).map(([key, columnData]) => {
                const { prop, value } = columnData as {
                  prop: { type: string; relationType?: string; with?: string };
                  value: unknown;
                };
                return (
                  <Table.Cell key={key} collapsing>
                    <div className="scrollable-cell-content">
                      {(Array.isArray(value) ? value : [value]).map((v, index) =>
                        prop.type === "relation" && prop.relationType !== "BelongsToOne" ? (
                          <div key={index}>
                            {JSON.stringify(v)}
                            {v !== null && prop.with && (
                              <Checkbox
                                className={isGraphNode ? "nodrag nopan" : ""}
                                checked={selectedIds.has(`${prop.with}#${v}`)}
                                onChange={(_, data) => {
                                  onRelationToggle(
                                    record.fixtureId,
                                    prop.with as string,
                                    v as number,
                                    data.checked as boolean,
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
                  </Table.Cell>
                );
              })}
            </Table.Row>

            {/* Target Row (사용자 지정 컬럼 기준 중복) */}
            {record.target && (
              <Table.Row key={`${record.id}-target`} warning>
                <Table.Cell collapsing>
                  <Popup
                    content="사용자 지정 컬럼 기준 중복"
                    position="left center"
                    trigger={<span>target</span>}
                  />
                </Table.Cell>
                {refineColumns(record.target.columns).map(([key, columnData]) => {
                  const { value } = columnData as { value: unknown };
                  return (
                    <Table.Cell key={key} collapsing>
                      <div className="scrollable-cell-content">{JSON.stringify(value)}</div>
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            )}

            {/* Unique Row (unique index 기준 중복) */}
            {record.unique && (
              <Table.Row key={`${record.id}-unique`} negative>
                <Table.Cell collapsing>
                  <Popup
                    content="Unique Index 기준 중복"
                    position="left center"
                    trigger={<span>unique</span>}
                  />
                </Table.Cell>
                {refineColumns(record.unique.columns).map(([key, columnData]) => {
                  const { value } = columnData as { value: unknown };
                  return (
                    <Table.Cell key={key} collapsing>
                      <div className="scrollable-cell-content">{JSON.stringify(value)}</div>
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            )}
          </>
        ))}
      </Table.Body>
    </Table>
  );
}
