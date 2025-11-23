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
  isGraphNode?: boolean; // react-flow 노드 내부인지 여부
};

/**
 * FixtureRecord 배열을 받아 하나의 엔티티 테이블을 렌더링하는 공통 컴포넌트
 */
export default function EntityTable({
  fixtures,
  onRelationToggle,
  selectedIds,
  setFixtureRecords,
  isGraphNode = false,
}: EntityTableProps) {
  // 컬럼 목록에서 'id'를 제외하는 헬퍼 함수
  // biome-ignore lint/suspicious/noExplicitAny: 컬럼 목록은 동적으로 생성되므로 any 사용
  const refineColumns = (columns: Record<string, any>) => {
    return Object.entries(columns).filter(([c]) => c !== "id");
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
            <Table.HeaderCell colSpan={Object.keys(firstRecord.columns).length + 1}>
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
            <Table.Row key={record.id} className={record.unique ? "unique-violated" : ""}>
              <Table.Cell collapsing rowSpan={record.target || record.unique ? 2 : 1}>
                {record.id} {record.unique && `(${record.unique.id})`}
                {record.target && (
                  <Popup
                    content="Override"
                    position="top center"
                    trigger={
                      <button
                        type="button"
                        style={{
                          cursor: "pointer",
                          padding: "1em",
                          paddingRight: "0",
                          display: "inline",
                        }}
                        onClick={() => {
                          setFixtureRecords((prev) =>
                            prev.map((r) =>
                              r.fixtureId === record.fixtureId
                                ? { ...r, override: !r.override }
                                : r,
                            ),
                          );
                        }}
                      >
                        <Icon name="check" color={record.override ? "green" : "grey"} />
                      </button>
                    }
                  />
                )}
                {record.unique && (
                  <button type="button" onClick={(e) => e.stopPropagation()}>
                    <Popup
                      content="Unique Violated"
                      position="top center"
                      trigger={
                        <div
                          style={{
                            cursor: "pointer",
                            padding: "1em",
                            paddingRight: "0",
                            display: "inline",
                          }}
                        >
                          <Icon name="question circle outline" />
                        </div>
                      }
                    />
                  </button>
                )}
              </Table.Cell>

              <Table.Cell collapsing>source</Table.Cell>
              {refineColumns(record.columns).map(([key, { prop, value }]) => (
                <Table.Cell key={key} collapsing>
                  <div className="scrollable-cell-content">
                    {(Array.isArray(value) ? value : [value]).map((v, index) =>
                      prop.type === "relation" && prop.relationType !== "BelongsToOne" ? (
                        <div key={index}>
                          {JSON.stringify(v)}
                          {v !== null && (
                            <Checkbox
                              className={isGraphNode ? "nodrag nopan" : ""}
                              checked={selectedIds.has(`${prop.with}#${v}`)}
                              onChange={(_, data) => {
                                onRelationToggle(
                                  record.fixtureId,
                                  prop.with,
                                  v,
                                  data.checked as boolean,
                                );
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        JSON.stringify(v)
                      ),
                    )}
                  </div>
                </Table.Cell>
              ))}
            </Table.Row>

            {record.target && (
              <Table.Row key={record.target.id} warning>
                <Table.Cell collapsing>target</Table.Cell>
                {refineColumns(record.target.columns).map(([key, { value }]) => (
                  <Table.Cell key={key} collapsing>
                    <div className="scrollable-cell-content">{JSON.stringify(value)}</div>
                  </Table.Cell>
                ))}
              </Table.Row>
            )}

            {record.unique && (
              <Table.Row key={`${record.id}unique`}>
                <Table.Cell collapsing>target</Table.Cell>
                {refineColumns(record.unique.columns).map(([key, { value }]) => (
                  <Table.Cell key={key} collapsing>
                    <div className="scrollable-cell-content">{JSON.stringify(value)}</div>
                  </Table.Cell>
                ))}
              </Table.Row>
            )}
          </>
        ))}
      </Table.Body>
    </Table>
  );
}
