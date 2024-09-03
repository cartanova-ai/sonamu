import { Checkbox, Table } from "semantic-ui-react";
import { FixtureRecord } from "sonamu";

type FixtureResultProps = {
  fixtureRecords: FixtureRecord[];
  onRelationToggle: (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean
  ) => void;
  selectedIds: Set<string>;
};

export default function FixtureRecordViewer({
  fixtureRecords,
  onRelationToggle,
  selectedIds,
}: FixtureResultProps) {
  const groupedRecords = Object.entries(
    fixtureRecords.reduce((acc, record) => {
      if (!acc[record.entityId]) {
        acc[record.entityId] = [];
      }
      acc[record.entityId].push(record);
      return acc;
    }, {} as Record<string, FixtureRecord[]>)
  );

  return (
    <div className="fixture-record-viewer">
      {groupedRecords.map(([, records]) => (
        <Table celled structured className="entity-table">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell
                colSpan={Object.keys(records[0].columns).length + 1}
              >
                {records[0].entityId}
              </Table.HeaderCell>
            </Table.Row>
            <Table.Row>
              {Object.entries(records[0].columns).map(([key]) => (
                <Table.HeaderCell key={key} collapsing>
                  {key}
                </Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {records.map((record) => (
              <Table.Row key={record.id}>
                {Object.entries(record.columns).map(
                  ([key, { prop, value }]) => (
                    <Table.Cell key={key} collapsing>
                      {(Array.isArray(value) ? value : [value]).map(
                        (v, index) =>
                          prop.type === "relation" &&
                          prop.relationType !== "BelongsToOne" ? (
                            <div key={index}>
                              {JSON.stringify(v)}
                              {v !== null && (
                                <Checkbox
                                  checked={selectedIds.has(`${prop.with}#${v}`)}
                                  onChange={(_, data) => {
                                    onRelationToggle(
                                      record.fixtureId,
                                      prop.with,
                                      v,
                                      data.checked as boolean
                                    );
                                  }}
                                />
                              )}
                            </div>
                          ) : (
                            JSON.stringify(v)
                          )
                      )}
                    </Table.Cell>
                  )
                )}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ))}
    </div>
  );
}
