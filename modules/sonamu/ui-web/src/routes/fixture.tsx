import {
  Button,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useTypeForm,
} from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { type FixtureImportResult, type FixtureRecord } from "sonamu";
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
import { useSonamuContext } from "../contexts/sonamu-provider";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { type ExtendedEntity } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import FixtureCodeViewer from "./fixture/_fixture_code_viewer";
import FixtureRecordViewer from "./fixture/_fixture_record_viewer";

export const Route = createFileRoute("/fixture")({
  component: FixtureIndex,
});

const DB_NAMES = ["development", "staging", "production", "fixture", "test"];

/**
 * 중복 확인 옵션 타입
 */
type DuplicateCheckColumns = {
  [entityId: string]: string[];
};

function FixtureIndex() {
  const { SD } = useSonamuContext();
  const { data: entitiesData, isLoading: entitiesLoading } = SonamuUIService.useEntities();
  const [sourceDB, setSourceDB] = useState("development");
  const [targetDB, setTargetDB] = useState("test");

  const [fixtureRecords, setFixtureRecords] = useState<FixtureRecord[]>([]);
  const [importResults, setImportResults] = useState<FixtureImportResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState(0);

  const [view, setView] = useState<"table" | "graph">("table");

  // 중복 확인 컬럼 설정
  const [duplicateCheckColumns, setDuplicateCheckColumns] = useState<DuplicateCheckColumns>({});

  // 중복 확인 설정용 임시 상태
  const [dupCheckEntityId, setDupCheckEntityId] = useState("");
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
  const nextSearchEntity = entitiesData?.entities?.find((entity) => entity.id === form.entityId);
  if (nextSearchEntity && nextSearchEntity !== searchEntity) {
    setSearchEntity(nextSearchEntity);
  }

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
        const collectDeletableRecords = (candidateFixtureId: string) => {
          if (visited.has(candidateFixtureId)) return;
          visited.add(candidateFixtureId);

          fixtureRecords.forEach((r) => {
            if (r.belongsRecords.includes(candidateFixtureId)) {
              collectDeletableRecords(r.fixtureId);
            }
          });
        };

        collectDeletableRecords(fixtureId);
      }

      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        toDelete.forEach((deletedFixtureId) => {
          newSet.delete(deletedFixtureId);
        });
        return newSet;
      });

      setFixtureRecords((prevRecords) =>
        prevRecords.filter((candidateRecord) => !toDelete.has(candidateRecord.fixtureId)),
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

  // Tabs는 activeTab state를 "0", "1" 문자열로 관리
  const tabValue = String(activeTab);

  return (
    <div className="p-5 min-h-screen bg-[#f7f7f7] flex gap-5">
      {/* 좌측: 설정 패널 */}
      <div className="w-[300px] shrink-0">
        <div className="flex flex-col gap-[15px] shadow-[0_5px_15px_rgba(0,0,0,0.1)] rounded-xl mb-[25px] p-5 bg-white border border-gray-200">
          {/* 1. Search Section */}
          <div className="flex flex-wrap flex-col gap-[5px] p-[15px] bg-[#fcfcfc] border border-[#e0e0e0] rounded-lg">
            <div className="flex gap-2 items-center mb-2">
              <SearchIcon />
              <span className="text-lg font-bold">{SD("fixture.searchSettings")}</span>
            </div>

            <div className="grow min-w-[150px]">
              <Select
                value={sourceDB}
                onValueChange={(value) => setSourceDB(value ?? "development")}
                items={DB_NAMES.map((db) => ({ value: db, label: db }))}
                placeholder={SD("fixture.selectSourceDb")}
              />
            </div>

            <div style={{ flexGrow: 1, minWidth: "200px" }}>
              <Select
                {...register("entityId")}
                disabled={entitiesLoading}
                items={
                  entitiesData?.entities?.map((entity) => ({
                    value: entity.id,
                    label: entity.id,
                  })) || []
                }
                placeholder={SD("fixture.selectEntity")}
              />
            </div>

            {searchEntity && (
              <>
                <Select
                  {...register("field")}
                  items={searchEntity.props
                    .filter((p) => {
                      if (p.type === "virtual") return false;
                      if (p.type === "relation") {
                        if (p.relationType === "BelongsToOne") return true;
                        if (p.relationType === "OneToOne" && p.hasJoinColumn) return true;
                        return false;
                      }
                      return true;
                    })
                    .map((prop) => ({ value: prop.name, label: prop.name }))}
                  placeholder={SD("fixture.selectColumn")}
                />
                <Input
                  placeholder={SD("fixture.inputSearchValue")}
                  {...register("value")}
                  style={{ flexGrow: 1 }}
                />
                <Select
                  {...register("searchType")}
                  items={[
                    { value: "equals", label: "Equals" },
                    { value: "like", label: "Like" },
                  ]}
                />
              </>
            )}

            <Button
              onClick={search}
              disabled={!form.entityId || !form.field || !form.value || entitiesLoading}
              variant="default"
            >
              {SD("fixture.search")}
            </Button>
          </div>

          {/* 2. Save Section */}
          <div className="flex flex-wrap flex-col gap-[5px] p-[15px] bg-[#e6f7ff] border border-[#99d8ff] rounded-lg">
            <button
              type="button"
              className="min-w-[130px] text-[1.1em] font-bold text-[#007bff] flex items-center cursor-pointer bg-transparent border-none p-0 w-full text-left"
              onClick={() => setShowSaveTargets(!showSaveTargets)}
            >
              {showSaveTargets ? (
                <ChevronDownIcon style={{ width: "16px", height: "16px" }} />
              ) : (
                <ChevronRightIcon style={{ width: "16px", height: "16px" }} />
              )}
              <DatabaseIcon style={{ marginRight: "5px", width: "16px", height: "16px" }} />
              {SD("fixture.saveSettings")}
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
                    <span
                      className="inline-block leading-none bg-green-500 text-white font-bold rounded px-2 py-1 text-xs"
                      style={{ marginLeft: "auto" }}
                    >
                      {SD("fixture.itemsToSave").replace("{count}", String(saveTargets.length))}
                    </span>
                  );
                })()}
            </button>

            <div className="grow min-w-[150px]">
              <Select
                value={targetDB}
                onValueChange={(value) => setTargetDB(value ?? "test")}
                items={DB_NAMES.map((db) => ({ value: db, label: db }))}
                placeholder={SD("fixture.selectTargetDb")}
              />
            </div>

            <Button onClick={saveFixture} variant="default" disabled={fixtureRecords.length === 0}>
              {SD("common.save")}
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

                const groupedByEntity: Record<string, FixtureRecord[]> = {};
                for (const fixture of saveTargets) {
                  groupedByEntity[fixture.entityId] ??= [];
                  groupedByEntity[fixture.entityId].push(fixture);
                }

                return (
                  <div style={{ marginTop: "10px", marginBottom: "10px" }}>
                    <p style={{ color: "#666", fontSize: "12px", marginBottom: "10px" }}>
                      {SD("fixture.fixtureList")}
                    </p>
                    <div className="flex flex-col gap-[10px]">
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
                              let reason = SD("fixture.new");
                              if (f.override && (hasTarget || hasUnique)) {
                                reason = SD("fixture.overwrite");
                              }

                              return (
                                <span
                                  key={f.fixtureId}
                                  className="inline-block leading-none bg-gray-200 text-gray-600 font-bold rounded px-2 py-1 text-[10px]"
                                  style={{ margin: "2px" }}
                                >
                                  #{f.id}
                                  <span className="inline-block align-top ml-4 opacity-80">
                                    {reason}
                                  </span>
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
            <div className="flex flex-wrap flex-col gap-[5px] p-[15px] bg-[#fcfcfc] border border-[#e0e0e0] rounded-lg">
              <p style={{ color: "#666", fontSize: "11px" }}>
                엔티티별로 중복 확인에 사용할 컬럼을 지정합니다. <br />
                지정하지 않으면 unique index만 사용합니다.
              </p>

              {/* 엔티티 선택 → 컬럼 선택 → 추가 버튼 */}
              <Select
                value={dupCheckEntityId}
                onValueChange={(value) => setDupCheckEntityId(value ?? "")}
                disabled={entitiesLoading}
                items={
                  entitiesData?.entities
                    ?.filter((e) => !duplicateCheckColumns[e.id])
                    .map((entity) => ({ value: entity.id, label: entity.id })) || []
                }
                placeholder={SD("fixture.selectEntity")}
              />

              {/* TODO: react-components에 multiple select가 없어서 단일 선택으로만 구현 */}
              <Select
                value={dupCheckSelectedColumns[0] || ""}
                onValueChange={(value) => setDupCheckSelectedColumns(value ? [value] : [])}
                disabled={!dupCheckEntity}
                items={
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
                    .map((prop) => ({ value: prop.name, label: prop.name })) || []
                }
                placeholder="중복 확인 컬럼 선택"
              />

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
                      className="inline-flex items-center leading-none bg-gray-200 text-gray-600 font-bold rounded text-sm"
                      style={{
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
      <div className="flex-1 min-w-0">
        <div className="w-full">
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
              {view === "table" ? SD("fixture.graphView") : SD("fixture.tableView")}
            </Button>
          </div>
          <Tabs value={tabValue} onValueChange={(value) => setActiveTab(Number(value))}>
            <TabsList>
              <TabsTrigger value="0">{SD("fixture.recordViewer")}</TabsTrigger>
              <TabsTrigger value="1">{SD("fixture.codeViewer")}</TabsTrigger>
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
