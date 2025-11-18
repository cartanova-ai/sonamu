import { SetStateAction } from "react";
import { FixtureRecord } from "sonamu";
import EntityTable from "../../components/fixture/EntityTable"; // 공통 테이블 컴포넌트 임포트
import { groupBy } from "lodash";

type FixtureResultProps = {
  fixtureRecords: FixtureRecord[];
  onRelationToggle: (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean
  ) => void;
  selectedIds: Set<string>;
  setFixtureRecords: (value: SetStateAction<FixtureRecord[]>) => void;
};

export default function FixtureRecordViewer({
  fixtureRecords,
  onRelationToggle,
  selectedIds,
  setFixtureRecords,
}: FixtureResultProps) {
  const groupedRecords = groupBy(fixtureRecords, "entityId");

  return (
    <div className="fixture-record-viewer">
      {Object.entries(groupedRecords).map(([entityId, records]) => (
        <EntityTable
          key={entityId}
          fixtures={records}
          selectedIds={selectedIds}
          onRelationToggle={onRelationToggle}
          setFixtureRecords={setFixtureRecords}
        />
      ))}
    </div>
  );
}
