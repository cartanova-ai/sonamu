import { group } from "radashi";
import type { SetStateAction } from "react";
import type { FixtureRecord } from "sonamu";
import EntityTable from "../../components/fixture/EntityTable"; // 공통 테이블 컴포넌트 임포트

type FixtureResultProps = {
  fixtureRecords: FixtureRecord[];
  onRelationToggle: (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean,
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
  const groupedRecords = group(fixtureRecords, (record) => record.entityId);

  return (
    <div className="fixture-record-viewer flex flex-col gap-4">
      {Object.entries(groupedRecords).map(([entityId, records]) => (
        <EntityTable
          key={entityId}
          fixtures={records ?? []}
          selectedIds={selectedIds}
          onRelationToggle={onRelationToggle}
          setFixtureRecords={setFixtureRecords}
        />
      ))}
    </div>
  );
}
