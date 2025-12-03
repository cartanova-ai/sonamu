import { useTypeForm } from "@sonamu-kit/react-sui";
import { useEffect, useState } from "react";
import { Button, Checkbox, Dropdown, Icon, Input, Label, Segment, Tab } from "semantic-ui-react";
import type { FixtureImportResult, FixtureRecord } from "sonamu";
import { z } from "zod";
import ChatComponent from "../../components/ChatComponent";
import FixtureGraph from "../../components/fixture/ErdGraph";
import { defaultCatch } from "../../services/sonamu.shared";
import { type ExtendedEntity, SonamuUIService } from "../../services/sonamu-ui.service";
import FixtureCodeViewer from "./_fixture_code_viewer";
import FixtureRecordViewer from "./_fixture_record_viewer";

const DB_NAMES = ["development_master", "production_master", "fixture_remote", "test"];

/**
 * 중복 확인 옵션 타입
 */
type DuplicateCheckColumns = {
  [entityId: string]: string[];
};

export default function FixtureIndex() {
  const { data: entitiesData, isLoading: entitiesLoading } = SonamuUIService.useEntities();
  const [sourceDB, setSourceDB] = useState("development_master");
  const [targetDB, setTargetDB] = useState("test");

  const [fixtureRecords, setFixtureRecords] = useState<FixtureRecord[]>([]);
  const [importResults, setImportResults] = useState<FixtureImportResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState(0);

  const [view, setView] = useState<"table" | "graph">("table");

  // 중복 확인 컬럼 설정
  const [duplicateCheckColumns, setDuplicateCheckColumns] = useState<DuplicateCheckColumns>({});

  // 중복 확인 설정용 임시 상태
  const [dupCheckEntityId, setDupCheckEntityId] = useState<string>("");
  const [dupCheckSelectedColumns, setDupCheckSelectedColumns] = useState<string[]>([]);

  // 저장 대상 상세 보기
  const [showSaveTargets, setShowSaveTargets] = useState(false);

  // AI Chat or Manual Mode
  const [mode, setMode] = useState<"chat" | "manual">("chat");

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

  // 중복 확인 설정용 선택된 엔티티
  const dupCheckEntity = entitiesData?.entities?.find((e) => e.id === dupCheckEntityId) ?? null;

  /**
   * 검색 실행 (Source DB에서 Fixture Record 가져오기)
   */
  const search = () => {
    if (!form.entityId || !form.field || !form.value) return;

    setActiveTab(0);
    setFixtureRecords([]);
    setImportResults([]);
    setSelectedIds(new Set());

    const duplicateCheck =
      Object.keys(duplicateCheckColumns).length > 0
        ? { columns: duplicateCheckColumns }
        : undefined;

    SonamuUIService.getFixtures(sourceDB, targetDB, form, duplicateCheck)
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

    const duplicateCheck =
      Object.keys(duplicateCheckColumns).length > 0
        ? { columns: duplicateCheckColumns }
        : undefined;

    if (isChecked) {
      SonamuUIService.getFixtures(
        sourceDB,
        targetDB,
        {
          entityId,
          field: "id",
          value: String(id),
          searchType: "equals",
        },
        duplicateCheck,
      )
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

  /**
   * 중복 확인 설정 추가
   */
  const addDuplicateCheckSetting = () => {
    if (!dupCheckEntityId || dupCheckSelectedColumns.length === 0) return;

    setDuplicateCheckColumns((prev) => ({
      ...prev,
      [dupCheckEntityId]: dupCheckSelectedColumns,
    }));

    // 입력 폼 초기화
    setDupCheckEntityId("");
    setDupCheckSelectedColumns([]);
  };

  /**
   * 중복 확인 설정 제거
   */
  const removeDuplicateCheckSetting = (entityId: string) => {
    setDuplicateCheckColumns((prev) => {
      const { [entityId]: _, ...rest } = prev;
      return rest;
    });
  };

  useEffect(() => {
    if (form.entityId && entitiesData?.entities) {
      const e = entitiesData.entities.find((e) => e.id === form.entityId);
      if (e) {
        setSearchEntity(e);
      }
    }
  }, [form.entityId, entitiesData]);

  // 엔티티 변경 시 컬럼 선택 초기화
  useEffect(() => {
    setDupCheckSelectedColumns([]);
  }, []);

  const panes = [
    {
      menuItem: "Fixture Record Viewer",
      render: () => (
        <Tab.Pane>
          {view === "table" ? (
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
      {/* 좌측: 설정 패널 */}
      <div className="fixture-sidebar">
        <Segment className="fixture-header">
          {/* 1. Search Section */}
          <div className="search-section">
            <div className="search-title">
              <Icon name="search" style={{ marginRight: "5px" }} />
              검색 대상 설정
            </div>

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

            {searchEntity && (
              <>
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
                />
                <Input placeholder="검색 값 입력" {...register("value")} style={{ flexGrow: 1 }} />
                <Dropdown
                  selection
                  options={[
                    { key: "equals", text: "Equals", value: "equals" },
                    { key: "like", text: "Like", value: "like" },
                  ]}
                  {...register("searchType")}
                />
              </>
            )}

            <Button
              onClick={search}
              disabled={!form.entityId || !form.field || !form.value || entitiesLoading}
              loading={entitiesLoading}
              primary
              content="검색"
            />
          </div>

          {/* 2. AI Chat or Duplicate Check Settings */}
          <div className="mode-toggle-section">
            <Checkbox
              toggle
              label="AI Chat"
              checked={mode === "chat"}
              onChange={(_, { checked }) => {
                if (checked) {
                  setMode("chat");
                } else {
                  setMode("manual");
                }
              }}
            />
          </div>
          {mode === "chat" ? (
            <ChatComponent
              fixtureRecords={fixtureRecords}
              onUpdateFixtures={(updatedRecords) => {
                setFixtureRecords(updatedRecords);

                // 새로 추가된 레코드들을 selectedIds에 추가
                const currentIds = new Set(fixtureRecords.map((r) => r.fixtureId));
                const newIds = updatedRecords
                  .filter((r) => !currentIds.has(r.fixtureId))
                  .map((r) => r.fixtureId);
                if (newIds.length > 0) {
                  setSelectedIds((prev) => new Set([...prev, ...newIds]));
                }
              }}
            />
          ) : (
            <div className="duplicate-check-section">
              <p style={{ color: "#666", fontSize: "11px" }}>
                엔티티별로 중복 확인에 사용할 컬럼을 지정합니다. <br />
                지정하지 않으면 unique index만 사용합니다.
              </p>

              {/* 엔티티 선택 → 컬럼 선택 → 추가 버튼 */}
              <Dropdown
                placeholder="엔티티 선택"
                search
                selection
                clearable
                loading={entitiesLoading}
                options={
                  entitiesData?.entities
                    ?.filter((e) => !duplicateCheckColumns[e.id]) // 이미 설정된 엔티티 제외
                    .map((entity) => ({
                      key: entity.id,
                      value: entity.id,
                      text: entity.id,
                    })) || []
                }
                value={dupCheckEntityId}
                onChange={(_, { value }) => setDupCheckEntityId(value as string)}
              />

              <Dropdown
                placeholder="중복 확인 컬럼 선택"
                multiple
                selection
                disabled={!dupCheckEntity}
                options={
                  dupCheckEntity?.props
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
                    })) || []
                }
                value={dupCheckSelectedColumns}
                onChange={(_, { value }) => setDupCheckSelectedColumns(value as string[])}
              />

              <Button
                icon="plus"
                color="blue"
                size="small"
                disabled={!dupCheckEntityId || dupCheckSelectedColumns.length === 0}
                onClick={addDuplicateCheckSetting}
              />

              {/* 설정된 중복 확인 목록 */}
              {Object.keys(duplicateCheckColumns).length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  {Object.entries(duplicateCheckColumns).map(([entityId, columns]) => (
                    <Label
                      key={entityId}
                      size="medium"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>{entityId}</span>
                      <span style={{ color: "#666" }}>({columns.join(", ")})</span>
                      <Icon
                        name="delete"
                        style={{ cursor: "pointer", marginLeft: "4px" }}
                        onClick={() => removeDuplicateCheckSetting(entityId)}
                      />
                    </Label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. Save Section */}
          <div className="save-section">
            <button
              type="button"
              className="save-title"
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                display: "flex",
                alignItems: "center",
                width: "100%",
                textAlign: "left",
              }}
              onClick={() => setShowSaveTargets(!showSaveTargets)}
            >
              <Icon name={showSaveTargets ? "chevron down" : "chevron right"} />
              <Icon name="database" style={{ marginRight: "5px" }} />
              저장 DB 설정
              {fixtureRecords.length > 0 &&
                (() => {
                  const saveTargets = fixtureRecords.filter((f) => {
                    const hasTarget = !!f.target;
                    const hasUnique = !!f.unique;

                    // 중복 없음: 무조건 저장
                    if (!hasTarget && !hasUnique) return true;

                    // override: target이나 unique가 있어도 덮어쓰기
                    if (f.override && (hasTarget || hasUnique)) return true;

                    return false;
                  });

                  return (
                    <Label color="green" size="small" style={{ marginLeft: "auto" }}>
                      {saveTargets.length}개 저장 예정
                    </Label>
                  );
                })()}
            </button>

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

            <Button
              onClick={saveFixture}
              color="blue"
              content="저장"
              disabled={fixtureRecords.length === 0}
            />

            {showSaveTargets &&
              fixtureRecords.length > 0 &&
              (() => {
                const saveTargets = fixtureRecords.filter((f) => {
                  const hasTarget = !!f.target;
                  const hasUnique = !!f.unique;

                  if (!hasTarget && !hasUnique) return true;
                  if (f.override && (hasTarget || hasUnique)) return true;

                  return false;
                });

                const groupedByEntity = saveTargets.reduce(
                  (acc, f) => {
                    if (!acc[f.entityId]) {
                      acc[f.entityId] = [];
                    }
                    acc[f.entityId].push(f);
                    return acc;
                  },
                  {} as Record<string, FixtureRecord[]>,
                );

                return (
                  <div style={{ marginTop: "10px", marginBottom: "10px" }}>
                    <p style={{ color: "#666", fontSize: "12px", marginBottom: "10px" }}>
                      저장될 픽스쳐 목록
                    </p>
                    <div className="fixture-record-group">
                      {Object.entries(groupedByEntity).map(([entityId, fixtures]) => (
                        <div
                          key={entityId}
                          style={{
                            padding: "8px",
                            backgroundColor: "#f9f9f9",
                            borderRadius: "4px",
                          }}
                        >
                          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                            {entityId} ({fixtures.length}개)
                          </div>
                          <div style={{ fontSize: "12px", color: "#555" }}>
                            {fixtures.map((f) => {
                              const hasTarget = !!f.target;
                              const hasUnique = !!f.unique;
                              let reason = "신규";
                              if (f.override && (hasTarget || hasUnique)) {
                                reason = "덮어쓰기";
                              }

                              return (
                                <Label key={f.fixtureId} size="tiny" style={{ margin: "2px" }}>
                                  #{f.id}
                                  <Label.Detail>{reason}</Label.Detail>
                                </Label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
          </div>
        </Segment>
      </div>
      <div className="fixture-main">
        <div className="fixture-viewer">
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "15px",
            }}
          >
            <Button
              onClick={() => setView(view === "table" ? "graph" : "table")}
              content={view === "table" ? "그래프 보기" : "테이블 보기"}
              icon={view === "table" ? "sitemap" : "table"}
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
    </div>
  );
}
