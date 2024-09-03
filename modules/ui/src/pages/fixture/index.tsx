import React, { useState, useEffect } from "react";
import { Button, Dropdown, Input, Segment } from "semantic-ui-react";
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
  const [selectedDB, setSelectedDB] = useState("development_master");
  const [importDB, setImportDB] = useState("fixture_remote");
  const [fixtureRecords, setFixtureRecords] = useState<FixtureRecord[]>([]);
  const [importResults, setImportResults] = useState<FixtureImportResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { form, register } = useTypeForm(
    z.object({
      entityId: z.string(),
      field: z.string(),
      value: z.string(),
      searchType: z.enum(["equals", "like"]),
    }),
    { entityId: "", field: "id", value: "", searchType: "equals" }
  );

  const [entity, setEntity] = useState<ExtendedEntity | null>(null);

  const search = () => {
    setSelectedIds(new Set());
    SonamuUIService.getFixtures(selectedDB, form)
      .then((res) => {
        setImportResults([]);
        setFixtureRecords(res);
        setSelectedIds(new Set(res.map((r) => r.fixtureId)));
      })
      .catch(defaultCatch);
  };

  const importFixture = () => {
    SonamuUIService.importFixtures(importDB, fixtureRecords)
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
      SonamuUIService.getFixtures(selectedDB, {
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
            parent.relatedRecords.push(fixtureId);
          }

          const newRecords = res.filter(
            (r) => !fixtureRecords.some((fr) => fr.fixtureId === r.fixtureId)
          );
          setFixtureRecords((prevRecords) =>
            Array.from([...prevRecords, ...newRecords])
          );
          setSelectedIds((prev) => new Set(prev).add(fixtureId));
        })
        .catch(defaultCatch);
    } else {
      const parent = fixtureRecords.find(
        (r) => r.fixtureId === parentFixtureId
      );
      if (!parent) return;

      parent.relatedRecords = parent.relatedRecords.filter(
        (r) => r !== fixtureId
      );

      const getRelatedRecords = (fixtureId: string, arr: Set<string>) => {
        const record = fixtureRecords.find((r) => r.fixtureId === fixtureId);
        if (record) {
          if (arr.has(fixtureId)) return;
          arr.add(fixtureId);

          record.relatedRecords.forEach((relatedId) => {
            if (!arr.has(relatedId)) {
              arr.add(relatedId);
              getRelatedRecords(relatedId, arr);
            }
          });
        }
      };

      const toProtect = new Set<string>();
      getRelatedRecords(parent.fixtureId, toProtect);

      const toDelete = new Set<string>();
      const visited = new Set<string>();

      const collectDeletableRecords = (fixtureId: string) => {
        if (visited.has(fixtureId)) return;
        visited.add(fixtureId);

        const record = fixtureRecords.find((r) => r.fixtureId === fixtureId);
        if (record) {
          if (!toProtect.has(fixtureId)) {
            toDelete.add(fixtureId);
          }

          record.relatedRecords.forEach((relatedFixtureId) => {
            if (!toProtect.has(relatedFixtureId)) {
              collectDeletableRecords(relatedFixtureId);
            }
          });
        }
      };

      collectDeletableRecords(fixtureId);

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
        setEntity(e);
      }
    }
  }, [form.entityId, entitiesData]);

  return (
    <div className="fixture-index">
      <Segment className="fixture-header">
        <div className="search-section">
          <Dropdown
            placeholder="Select DB"
            selection
            options={DB_NAMES.map((db) => ({
              key: db,
              value: db,
              text: db.replace("_master", ""),
            }))}
            value={selectedDB}
            onChange={(_, { value }) => setSelectedDB(value as string)}
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
          {entity && (
            <div className="search-field">
              <Dropdown
                placeholder="Columns"
                search
                selection
                options={entity.props.map((prop) => ({
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

        {fixtureRecords.length > 0 && (
          <div className="import-section">
            <Dropdown
              placeholder="Select DB to import"
              selection
              options={DB_NAMES.map((db) => ({
                key: db,
                value: db,
                text: db,
              }))}
              value={importDB}
              onChange={(_, { value }) => setImportDB(value as string)}
            />
            <Button onClick={importFixture} primary content="Import Fixture" />
          </div>
        )}
      </Segment>

      <div className="fixture-viewer">
        <FixtureRecordViewer
          fixtureRecords={fixtureRecords}
          onRelationToggle={fetchRelatedRecord}
          selectedIds={selectedIds}
        />

        {entitiesData?.entities && importResults.length > 0 && (
          <FixtureCodeViewer
            entities={entitiesData.entities}
            fixtureResults={importResults}
          />
        )}
      </div>
    </div>
  );
}
