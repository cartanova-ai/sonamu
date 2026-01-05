import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useTypeForm,
} from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FixtureImportResult, FixtureRecord } from "sonamu";
import { z } from "zod";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import DatabaseIcon from "~icons/lucide/database";
import GridIcon from "~icons/lucide/grid";
import PlusIcon from "~icons/lucide/plus";
import SearchIcon from "~icons/lucide/search";
import TableIcon from "~icons/lucide/table";
import TrashIcon from "~icons/lucide/trash";
import ChatComponent from "../components/ChatComponent";
import FixtureGraph from "../components/fixture/ErdGraph";
import { defaultCatch } from "../services/sonamu.shared";
import { type ExtendedEntity, SonamuUIService } from "../services/sonamu-ui.service";
import FixtureCodeViewer from "./fixture/_fixture_code_viewer";
import FixtureRecordViewer from "./fixture/_fixture_record_viewer";

export const Route = createFileRoute("/fixture")({
  component: FixtureIndex,
});

const DB_NAMES = ["development_master", "production_master", "fixture_remote", "test"];

/**
 * 중복 확인 옵션 타입
 */
type DuplicateCheckColumns = {
  [entityId: string]: string[];
};

function FixtureIndex() {
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
  const [mode, _setMode] = useState<"chat" | "manual">("chat");

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

  // Tabs는 activeTab state를 "0", "1" 문자열로 관리
  const tabValue = String(activeTab);

  return (
    <div className="fixture-index">
      {/* 좌측: 설정 패널 */}
      <div className="fixture-sidebar">
        <div className="ui segment fixture-header">
          {/* 1. Search Section */}
          <div className="search-section">
            <div className="search-title">
              <SearchIcon style={{ marginRight: "5px", width: "16px", height: "16px" }} />
              검색 대상 설정
            </div>

            <div className="db-dropdown-wrapper">
              <Select
                value={sourceDB}
                onValueChange={(value) => setSourceDB(value || "development_master")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="검색할 DB 선택" />
                </SelectTrigger>
                <SelectContent>
                  {DB_NAMES.map((db) => (
                    <SelectItem key={db} value={db}>
                      {db.replace("_master", "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div style={{ flexGrow: 1, minWidth: "200px" }}>
              <Select {...register("entityId")}>
                <SelectTrigger disabled={entitiesLoading}>
                  <SelectValue placeholder="엔티티 선택" />
                </SelectTrigger>
                <SelectContent>
                  {entitiesData?.entities?.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.id}
                    </SelectItem>
                  )) || []}
                </SelectContent>
              </Select>
            </div>

            {searchEntity && (
              <>
                <Select {...register("field")}>
                  <SelectTrigger>
                    <SelectValue placeholder="컬럼 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {searchEntity.props
                      .filter((p) => {
                        if (p.type === "virtual") return false;
                        if (p.type === "relation") {
                          if (p.relationType === "BelongsToOne") return true;
                          if (p.relationType === "OneToOne" && p.hasJoinColumn) return true;
                          return false;
                        }
                        return true;
                      })
                      .map((prop) => (
                        <SelectItem key={prop.name} value={prop.name}>
                          {prop.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input placeholder="검색 값 입력" {...register("value")} style={{ flexGrow: 1 }} />
                <Select {...register("searchType")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="like">Like</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            <Button
              onClick={search}
              disabled={!form.entityId || !form.field || !form.value || entitiesLoading}
              variant="default"
            >
              검색
            </Button>
          </div>

          {/* 2. Save Section */}
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
              {showSaveTargets ? (
                <ChevronDownIcon style={{ width: "16px", height: "16px" }} />
              ) : (
                <ChevronRightIcon style={{ width: "16px", height: "16px" }} />
              )}
              <DatabaseIcon style={{ marginRight: "5px", width: "16px", height: "16px" }} />
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
                    <span className="ui green small label" style={{ marginLeft: "auto" }}>
                      {saveTargets.length}개 저장 예정
                    </span>
                  );
                })()}
            </button>

            <div className="db-dropdown-wrapper">
              <Select value={targetDB} onValueChange={(value) => setTargetDB(value || "test")}>
                <SelectTrigger>
                  <SelectValue placeholder="저장할 대상 DB 선택" />
                </SelectTrigger>
                <SelectContent>
                  {DB_NAMES.map((db) => (
                    <SelectItem key={db} value={db}>
                      {db}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={saveFixture} variant="default" disabled={fixtureRecords.length === 0}>
              저장
            </Button>

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
                                <span
                                  key={f.fixtureId}
                                  className="ui tiny label"
                                  style={{ margin: "2px" }}
                                >
                                  #{f.id}
                                  <span className="detail">{reason}</span>
                                </span>
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

          {/* 3. AI Chat or Duplicate Check Settings */}
          {/* <div className="mode-toggle-section">
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
          </div> */}
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
              <Select
                value={dupCheckEntityId}
                onValueChange={(value) => setDupCheckEntityId(value || "")}
              >
                <SelectTrigger disabled={entitiesLoading}>
                  <SelectValue placeholder="엔티티 선택" />
                </SelectTrigger>
                <SelectContent>
                  {entitiesData?.entities
                    ?.filter((e) => !duplicateCheckColumns[e.id])
                    .map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.id}
                      </SelectItem>
                    )) || []}
                </SelectContent>
              </Select>

              {/* TODO: react-components에 multiple select가 없어서 단일 선택으로만 구현 */}
              <Select
                value={dupCheckSelectedColumns[0] || ""}
                onValueChange={(value) => setDupCheckSelectedColumns(value ? [value] : [])}
                disabled={!dupCheckEntity}
              >
                <SelectTrigger>
                  <SelectValue placeholder="중복 확인 컬럼 선택" />
                </SelectTrigger>
                <SelectContent>
                  {dupCheckEntity?.props
                    .filter((p) => {
                      if (p.type === "virtual") return false;
                      if (p.type === "relation") {
                        if (p.relationType === "BelongsToOne") return true;
                        if (p.relationType === "OneToOne" && p.hasJoinColumn) return true;
                        return false;
                      }
                      return true;
                    })
                    .map((prop) => (
                      <SelectItem key={prop.name} value={prop.name}>
                        {prop.name}
                      </SelectItem>
                    )) || []}
                </SelectContent>
              </Select>

              <Button
                icon={<PlusIcon />}
                variant="default"
                size="sm"
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
                    <span
                      key={entityId}
                      className="ui medium label"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>{entityId}</span>
                      <span style={{ color: "#666" }}>({columns.join(", ")})</span>
                      <TrashIcon
                        style={{
                          cursor: "pointer",
                          marginLeft: "4px",
                          width: "16px",
                          height: "16px",
                        }}
                        onClick={() => removeDuplicateCheckSetting(entityId)}
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
              variant="outline"
              icon={view === "table" ? <GridIcon /> : <TableIcon />}
            >
              {view === "table" ? "그래프 보기" : "테이블 보기"}
            </Button>
          </div>
          <Tabs
            value={tabValue}
            onValueChange={(value) => setActiveTab(Number(value))}
            style={{
              boxShadow: "0 5px 15px rgba(0, 0, 0, 0.08)",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <TabsList>
              <TabsTrigger value="0">Fixture Record Viewer</TabsTrigger>
              <TabsTrigger value="1">Fixture Code Viewer</TabsTrigger>
            </TabsList>
            <TabsContent value="0">
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
            </TabsContent>
            <TabsContent value="1">
              {entitiesData?.entities && importResults.length > 0 && (
                <FixtureCodeViewer
                  entities={entitiesData.entities}
                  fixtureResults={importResults}
                  targetDB={targetDB}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
