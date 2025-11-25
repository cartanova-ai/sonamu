import { useTypeForm } from "@sonamu-kit/react-sui";
import { useEffect, useState } from "react";
import { Button, Dropdown, Icon, Input, Segment, Tab } from "semantic-ui-react";
import type { FixtureImportResult, FixtureRecord } from "sonamu";
import { z } from "zod";
import FixtureGraph from "../../components/fixture/ErdGraph";
import { defaultCatch } from "../../services/sonamu.shared";
import { type ExtendedEntity, SonamuUIService } from "../../services/sonamu-ui.service";
import FixtureCodeViewer from "./_fixture_code_viewer";
import FixtureRecordViewer from "./_fixture_record_viewer";

const DB_NAMES = ["development_master", "production_master", "fixture_remote", "test"];

export default function FixtureIndex() {
  const { data: entitiesData, isLoading: entitiesLoading } = SonamuUIService.useEntities();
  const [sourceDB, setSourceDB] = useState("development_master");
  const [targetDB, setTargetDB] = useState("fixture_remote"); // 저장할 대상 DB

  const [fixtureRecords, setFixtureRecords] = useState<FixtureRecord[]>([]);
  const [importResults, setImportResults] = useState<FixtureImportResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState(0);

  const [mode, setMode] = useState<"table" | "graph">("table");

  const { form, register } = useTypeForm(
    z.object({
      entityId: z.string(),
      field: z.string(),
      value: z.string(),
      searchType: z.enum(["equals", "like"]),
    }),
    { entityId: "", field: "id", value: "", searchType: "equals" },
  );

  const [searchEntity, setSearchEntity] = useState<ExtendedEntity | null>(null);

  /**
   * 검색 실행 (Source DB에서 Fixture Record 가져오기)
   */
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

  /**
   * Fixture 저장 실행 (Target DB에 Fixture Record 저장)
   */
  const saveFixture = () => {
    if (fixtureRecords.length === 0) return;
    setActiveTab(1);

    // SonamuUIService.importFixtures는 '가져오기'와 '저장하기' 모두에 사용되는 내부 함수입니다.
    // 여기서는 '저장하기' 기능을 수행합니다.
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
    isChecked: boolean,
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
          const parent = fixtureRecords.find((r) => r.fixtureId === parentFixtureId);
          if (parent) {
            parent.fetchedRecords.push(fixtureId);
          }

          const newRecords = res.filter(
            (r) => !fixtureRecords.some((fr) => fr.fixtureId === r.fixtureId),
          );
          setFixtureRecords((prevRecords) => Array.from([...prevRecords, ...newRecords]));
          setSelectedIds((prev) => {
            const newSet = new Set(prev);
            newRecords.forEach((r) => {
              newSet.add(r.fixtureId);
            });
            return newSet;
          });
        })
        .catch(defaultCatch);
    } else {
      const parent = fixtureRecords.find((r) => r.fixtureId === parentFixtureId);
      if (!parent) return;

      parent.fetchedRecords = parent.fetchedRecords.filter((r) => r !== fixtureId);

      const toDelete = new Set<string>([fixtureId]);
      const record = fixtureRecords.find((r) => r.fixtureId === fixtureId);

      if (record?.fetchedRecords.length) {
        // 해당 레코드를 불러올 때 포함된 레코드 중에서 다른 레코드에도 필요한 레코드는 삭제하지 않음
        const toProtect = new Set<string>([parentFixtureId]);

        fixtureRecords.forEach((r) => {
          if (r.fixtureId !== fixtureId) {
            r.fetchedRecords.forEach((relatedFixtureId) => {
              toProtect.add(relatedFixtureId);
            });
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
        toDelete.forEach((fixtureId) => {
          newSet.delete(fixtureId);
        });
        return newSet;
      });

      setFixtureRecords((prevRecords) =>
        prevRecords.filter((record) => !toDelete.has(record.fixtureId)),
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
          {mode === "table" ? (
            <FixtureRecordViewer
              fixtureRecords={fixtureRecords}
              onRelationToggle={fetchRelatedRecord}
              selectedIds={selectedIds}
              setFixtureRecords={setFixtureRecords}
            />
          ) : (
            <FixtureGraph
              fixtures={fixtureRecords}
              selectedIds={selectedIds}
              onRelationToggle={fetchRelatedRecord}
              setFixtureRecords={setFixtureRecords}
            />
          )}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {/* 1. Search Section (메인 검색 컨트롤) */}
          <div className="search-section">
            <div className="search-title">
              <Icon name="search" style={{ marginRight: "5px" }} />
              검색 대상 설정
            </div>

            {/* Source DB Dropdown */}
            <div className="db-dropdown-wrapper">
              <Dropdown
                fluid
                placeholder="검색할 DB 선택"
                selection
                options={DB_NAMES.map((db) => ({
                  key: db,
                  value: db,
                  text: db.replace("_master", ""),
                }))}
                value={sourceDB}
                onChange={(_, { value }) => setSourceDB(value as string)}
              />
            </div>

            {/* Entity Dropdown */}
            <div style={{ flexGrow: 1, minWidth: "200px" }}>
              <Dropdown
                fluid
                placeholder="엔티티 선택"
                search
                selection
                loading={entitiesLoading}
                options={
                  entitiesData?.entities?.map((entity) => ({
                    key: entity.id,
                    value: entity.id,
                    text: entity.id,
                  })) || []
                }
                {...register("entityId")}
              />
            </div>

            {/* Search Field Group */}
            {searchEntity && (
              <div className="search-field-group">
                <Dropdown
                  placeholder="컬럼 선택"
                  selection
                  options={searchEntity.props
                    .filter((p) => {
                      if (p.type === "virtual") return false;
                      if (p.type === "relation") {
                        if (p.relationType === "BelongsToOne") return true;
                        if (p.relationType === "OneToOne" && p.hasJoinColumn) return true;
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
                  style={{ flexBasis: "150px" }}
                />
                <Input placeholder="검색 값 입력" {...register("value")} style={{ flexGrow: 1 }} />
                <Dropdown
                  selection
                  options={[
                    { key: "equals", text: "Equals", value: "equals" },
                    { key: "like", text: "Like", value: "like" },
                  ]}
                  {...register("searchType")}
                  style={{ flexBasis: "100px" }}
                />
              </div>
            )}

            {/* Search Button */}
            <Button
              onClick={search}
              disabled={!form.entityId || !form.field || !form.value || entitiesLoading}
              loading={entitiesLoading}
              primary
              content="검색"
            />
          </div>

          {/* 2. Save Section (저장 컨트롤) */}
          <div className="save-section">
            <div className="save-title">
              <Icon name="database" style={{ marginRight: "5px" }} />
              저장 DB 설정
            </div>

            {/* Target DB Dropdown */}
            <div className="db-dropdown-wrapper">
              <Dropdown
                fluid
                placeholder="저장할 대상 DB 선택"
                header="Fixture Target DB"
                selection
                options={DB_NAMES.map((db) => ({
                  key: db,
                  value: db,
                  text: db,
                }))}
                value={targetDB}
                onChange={(_, { value }) => setTargetDB(value as string)}
              />
            </div>

            {/* Save Button */}
            <Button
              onClick={saveFixture}
              color="blue"
              content="저장"
              disabled={fixtureRecords.length === 0}
            />
          </div>
        </div>
      </Segment>

      <div className="fixture-viewer">
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "15px",
          }}
        >
          <Button
            onClick={() => setMode(mode === "table" ? "graph" : "table")}
            content={mode === "table" ? "그래프 보기" : "테이블 보기"}
            icon={mode === "table" ? "sitemap" : "table"}
            basic
            color="grey"
          />
        </div>
        <Tab
          panes={panes}
          activeIndex={activeTab}
          onTabChange={(_, { activeIndex }) => {
            if (typeof activeIndex === "number") {
              setActiveTab(activeIndex);
            }
          }}
          style={{
            boxShadow: "0 5px 15px rgba(0, 0, 0, 0.08)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        />
      </div>
    </div>
  );
}
