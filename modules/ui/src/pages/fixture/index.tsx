import React, { useState, useEffect } from "react";
import { Button, Dropdown, Input, Segment, Tab } from "semantic-ui-react";
import {
  ExtendedEntity,
  SonamuUIService,
} from "../../services/sonamu-ui.service";
import { useTypeForm } from "@sonamu-kit/react-sui";
import { z } from "zod";
import { defaultCatch } from "../../services/sonamu.shared";
import { FixtureRecord, FixtureImportResult } from "sonamu";
import FixtureRecordViewer from "./_fixture_record_viewer";
import FixtureCodeViewer from "./_fixture_code_viewer";

const DB_NAMES = [
  "development_master",
  "production_master",
  "fixture_remote",
  "fixture_local",
  "test",
];

export default function FixtureIndex() {
  const {
    data: entitiesData,
    error: entitiesError,
    isLoading: entitiesLoading,
  } = SonamuUIService.useEntities();
  const [sourceDB, setSourceDB] = useState("development_master");
  const [targetDB, setTargetDB] = useState("fixture_remote");

  const [fixtureRecords, setFixtureRecords] = useState<FixtureRecord[]>([]);
  const [importResults, setImportResults] = useState<FixtureImportResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState(0);

  const { form, register } = useTypeForm(
    z.object({
      entityId: z.string(),
      field: z.string(),
      value: z.string(),
      searchType: z.enum(["equals", "like"]),
    }),
    { entityId: "", field: "id", value: "", searchType: "equals" }
  );

  const [searchEntity, setSearchEntity] = useState<ExtendedEntity | null>(null);

  const search = () => {
    if (!form.entityId || !form.field || !form.value) return;

    setActiveTab(0);
    setFixtureRecords([]);
    setImportResults([]);
    setSelectedIds(new Set());

    SonamuUIService.getFixtures(sourceDB, targetDB, form)
      .then((res) => {
        setFixtureRecords(res);
        setSelectedIds(new Set(res.map((r) => r.fixtureId)));
      })
      .catch(defaultCatch);
  };

  const importFixture = () => {
    if (fixtureRecords.length === 0) return;
    setActiveTab(1);

    SonamuUIService.importFixtures(targetDB, fixtureRecords)
      .then((results) => {
        setImportResults(results);
      })
      .catch(defaultCatch);
  };

  const fetchRelatedRecord = async (
    parentFixtureId: string,
    entityId: string,
    id: number,
    isChecked: boolean
  ) => {
    const fixtureId = `${entityId}#${id}`;

    if (isChecked) {
      SonamuUIService.getFixtures(sourceDB, targetDB, {
        entityId,
        field: "id",
        value: String(id),
        searchType: "equals",
      })
        .then((res) => {
          const parent = fixtureRecords.find(
            (r) => r.fixtureId === parentFixtureId
          );
          if (parent) {
            parent.fetchedRecords.push(fixtureId);
          }

          const newRecords = res.filter(
            (r) => !fixtureRecords.some((fr) => fr.fixtureId === r.fixtureId)
          );
          setFixtureRecords((prevRecords) =>
            Array.from([...prevRecords, ...newRecords])
          );
          setSelectedIds((prev) => {
            const newSet = new Set(prev);
            newRecords.forEach((r) => newSet.add(r.fixtureId));
            return newSet;
          });
        })
        .catch(defaultCatch);
    } else {
      const parent = fixtureRecords.find(
        (r) => r.fixtureId === parentFixtureId
      );
      if (!parent) return;

      parent.fetchedRecords = parent.fetchedRecords.filter(
        (r) => r !== fixtureId
      );

      const toDelete = new Set<string>([fixtureId]);
      const record = fixtureRecords.find((r) => r.fixtureId === fixtureId);

      if (record?.fetchedRecords.length) {
        // 해당 레코드를 불러올 때 포함된 레코드 중에서 다른 레코드에도 필요한 레코드는 삭제하지 않음
        const toProtect = new Set<string>([parentFixtureId]);

        fixtureRecords.forEach((r) => {
          if (r.fixtureId !== fixtureId) {
            r.fetchedRecords.forEach((relatedFixtureId) =>
              toProtect.add(relatedFixtureId)
            );
          }
        });

        record?.fetchedRecords.forEach((relatedFixtureId) => {
          if (!toProtect.has(relatedFixtureId)) {
            toDelete.add(relatedFixtureId);
          }
        });
      } else {
        // 해당 레코드를 불러올 때 포함된 레코드가 없다면(즉, 다른 레코드를 불러올 때 포함된 레코드인 경우)
        // 해당 레코드를 필요로 하는 다른 레코드 확인하여 삭제
        const visited = new Set<string>();
        const collectDeletableRecords = (fixtureId: string) => {
          if (visited.has(fixtureId)) return;
          visited.add(fixtureId);

          fixtureRecords.forEach((r) => {
            if (r.belongsRecords.includes(fixtureId)) {
              collectDeletableRecords(r.fixtureId);
            }
          });
        };

        collectDeletableRecords(fixtureId);
      }

      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        toDelete.forEach((fixtureId) => newSet.delete(fixtureId));
        return newSet;
      });

      setFixtureRecords((prevRecords) =>
        prevRecords.filter((record) => !toDelete.has(record.fixtureId))
      );
    }
  };

  useEffect(() => {
    if (form.entityId && entitiesData?.entities) {
      const e = entitiesData.entities.find((e) => e.id === form.entityId);
      if (e) {
        setSearchEntity(e);
      }
    }
  }, [form.entityId, entitiesData]);

  const panes = [
    {
      menuItem: "Fixture Record Viewer",
      render: () => (
        <Tab.Pane>
          <FixtureRecordViewer
            fixtureRecords={fixtureRecords}
            onRelationToggle={fetchRelatedRecord}
            selectedIds={selectedIds}
            setFixtureRecords={setFixtureRecords}
          />
        </Tab.Pane>
      ),
    },
    {
      menuItem: "Fixture Code Viewer",
      render: () => (
        <Tab.Pane>
          {entitiesData?.entities && importResults.length > 0 && (
            <FixtureCodeViewer
              entities={entitiesData.entities}
              fixtureResults={importResults}
              targetDB={targetDB}
            />
          )}
        </Tab.Pane>
      ),
    },
  ];

  return (
    <div className="fixture-index">
      <Segment className="fixture-header">
        <div className="search-section">
          <Dropdown
            placeholder="Select DB to search"
            header="Search source DB"
            selection
            options={DB_NAMES.map((db) => ({
              key: db,
              value: db,
              text: db.replace("_master", ""),
            }))}
            value={sourceDB}
            onChange={(_, { value }) => setSourceDB(value as string)}
          />
          <Dropdown
            placeholder="Entities"
            search
            selection
            options={
              entitiesData?.entities?.map((entity) => ({
                key: entity.id,
                value: entity.id,
                text: entity.id,
              })) || []
            }
            {...register("entityId")}
          />
          {searchEntity && (
            <div className="search-field">
              <Dropdown
                placeholder="Columns"
                search
                selection
                options={searchEntity.props
                  .filter((p) => {
                    if (p.type === "virtual") return false;
                    if (p.type === "relation") {
                      if (p.relationType === "BelongsToOne") return true;
                      if (p.relationType === "OneToOne" && p.hasJoinColumn)
                        return true;
                      return false;
                    }
                    return true;
                  })
                  .map((prop) => ({
                    key: prop.name,
                    value: prop.name,
                    text: prop.name,
                  }))}
                {...register("field")}
              />
              <Input placeholder="Search" {...register("value")} />
              <Dropdown
                placeholder="Search Type"
                selection
                options={[
                  { key: "equals", text: "Equals", value: "equals" },
                  { key: "like", text: "Like", value: "like" },
                ]}
                {...register("searchType")}
              />
            </div>
          )}
          <Button
            onClick={search}
            disabled={!form.entityId || !form.field || !form.value}
            loading={entitiesLoading}
            primary
            content="Search"
          />
        </div>

        <div className="import-section">
          <Dropdown
            placeholder="Select DB to import"
            header="Import target DB"
            selection
            options={DB_NAMES.map((db) => ({
              key: db,
              value: db,
              text: db,
            }))}
            value={targetDB}
            onChange={(_, { value }) => setTargetDB(value as string)}
          />
          <Button
            onClick={importFixture}
            primary
            content="Import Fixture"
            disabled={fixtureRecords.length === 0}
          />
        </div>
      </Segment>

      <div className="fixture-viewer">
        <Tab
          panes={panes}
          activeIndex={activeTab}
          onTabChange={(_, { activeIndex }) => {
            if (typeof activeIndex === "number") {
              setActiveTab(activeIndex);
            }
          }}
        />
      </div>
    </div>
  );
}
