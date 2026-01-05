/** biome-ignore-all lint/style/noNonNullAssertion: 너무 많이 사용하고 있어서 일단 허용 */

import { Button, Checkbox } from "@sonamu-kit/react-components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import classNames from "classnames";
import { unique } from "radashi";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntityIndex, EntityProp, FlattenSubsetRow } from "sonamu";
import CheckIcon from "~icons/lucide/check";
import PlusIcon from "~icons/lucide/plus";
import Trash2Icon from "~icons/lucide/trash-2";
import { useCommonModal } from "../../components/core/CommonModal";
import { EditableInput } from "../../components/EditableInput";
import { SheetCellInput } from "../../components/SheetCellInput";
import { useSheetTable } from "../../components/useSheetTable";
import { defaultCatch } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { EntitySelector } from "../entities/_entity_selector";
import { EntityIndexForm } from "../entities/_index_form";
import { EntityPropForm } from "../entities/_prop_form";

export const Route = createFileRoute("/entities/$entityId")({
  component: EntitiesShowPage,
});

type EntitiesShowPageProps = {};
function EntitiesShowPage({}: EntitiesShowPageProps) {
  const { data, refetch, isLoading } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  // naviagte
  const navigate = useNavigate();

  const { entityId } = Route.useParams();

  const entity = entities?.find((entity) => entity.id === entityId) ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: entityId 변경시에만 감지
  useEffect(() => {
    setCursor({
      sheet: "props",
      y: 0,
      x: 0,
    });
  }, [entityId]);
  const delEntity = () => {
    if (!entity) {
      return;
    }
    const answer = confirm(`Are you sure to delete an entity "${entity.id}"?`);
    if (!answer) {
      return;
    }

    SonamuUIService.delEntity(entity.id)
      .then(() => {
        refetch();
        navigate({ to: "/entities" });
      })
      .catch(defaultCatch);
  };

  // commonModal
  const { openModal, open } = useCommonModal();

  // useSheetTable
  const { regRow, regCell, cursor, setCursor, setFocusedCursor, turnKeyHandler, isFocused } =
    useSheetTable({
      sheets: [
        {
          name: "props",
        },
        {
          name: "indexes",
        },
        ...Object.keys(entity?.enumLabels ?? {}).map((enumId) => ({
          name: `enumLabels-${enumId}`,
        })),
        ...(entity?.parentId === undefined
          ? [
              {
                name: "subsets",
              },
            ]
          : []),
      ],
      onExecute: (sheet, y, x) => {
        if (sheet === "props") {
          openPropForm("modify", y, x);
        } else if (sheet === "indexes") {
          openIndexForm("modify", y, x);
        }
      },
      onKeywordChanged: (sheet, keyword) => {
        if (!entity) {
          return;
        }
        setCursor({
          sheet,
          y: (() => {
            if (sheet === "props") {
              return entity.props.findIndex((prop) => prop.name.startsWith(keyword));
            } else if (sheet === "indexes") {
              return entity.indexes.findIndex((index) => index.columns.join(",").includes(keyword));
            } else if (sheet === "subsets") {
              return entity.flattenSubsetRows.findIndex((subsetRow) =>
                subsetRow.field.startsWith(keyword),
              );
            } else if (sheet.startsWith("enumLabels-")) {
              const enumId = sheet.replace("enumLabels-", "");
              return enumLabelsArray[enumId].findIndex(
                (enumLabel) =>
                  enumLabel.key.startsWith(keyword) || enumLabel.label.startsWith(keyword),
              );
            }
            return 0;
          })(),
          x: 0,
        });
      },
      onKeydown: (e) => {
        if (!entity) {
          return false;
        }

        switch (e.key) {
          case "n":
          case "N":
            if (e.ctrlKey && e.metaKey && e.shiftKey) {
              if (cursor.sheet === "props") {
                openPropForm("add", undefined, 2);
              } else if (cursor.sheet === "indexes") {
                openIndexForm("add", cursor.y);
              } else if (cursor.sheet.includes("enumLabels")) {
                addEnumLabelRow(cursor.sheet.split("-")[1], cursor.y);
              }
              return false;
            }
            break;

          case "Backspace":
            if (e.metaKey) {
              if (cursor.sheet === "props") {
                confirmDelProp(cursor.y);
              } else if (cursor.sheet === "indexes") {
                confirmDelIndex(cursor.y);
              } else if (cursor.sheet.startsWith("enumLabels")) {
                const [, enumId] = /^enumLabels-(.+)$/.exec(cursor.sheet) ?? [];
                if (!enumId) {
                  return false;
                }
                const enumLabels = enumLabelsArray[enumId];
                enumLabels.splice(cursor.y, 1);
                SonamuUIService.modifyEnumLabels(
                  entity.id,
                  enumLabelsArrayToEnumLabels(enumLabelsArray),
                )
                  .then(({ updated }) => {
                    entity.enumLabels = updated;
                    refetch();
                  })
                  .catch(defaultCatch);
              }
              e.preventDefault();
              return false;
            }
            break;
          case "p":
          case "P":
            if (e.ctrlKey && e.shiftKey && e.metaKey) {
              openModal(<EntitySelector />, {
                onControlledOpen: () => {
                  turnKeyHandler(false);
                },
                onControlledClose: () => {
                  turnKeyHandler(true);
                },
                onCompleted: (entityId) => {
                  navigate({ to: "/entities/$entityId", params: { entityId: entityId as string } });
                },
              });
            }
            break;
        }
        return true;
      },
      disable: open,
    });

  // subsets
  const enumLabelsArray: {
    [enumId: string]: { key: string; label: string }[];
  } = useMemo(() => {
    if (!entity) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(entity.enumLabels).map(([enumId, enumLabels]) => [
        enumId,
        Object.entries(enumLabels).map(([key, label]) => ({
          key,
          label,
        })),
      ]),
    );
  }, [entity]);
  const enumLabelsArrayToEnumLabels = (enumLabelsArray: {
    [enumId: string]: { key: string; label: string }[];
  }) => {
    if (!entity) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(enumLabelsArray).map(([enumId, enumLabels]) => [
        enumId,
        Object.fromEntries(enumLabels.map(({ key, label }) => [key, label])),
      ]),
    );
  };
  const appendFieldOnSubset = (subsetKey: string, field: string, at?: number) => {
    if (!entity) {
      return;
    }
    const subset = entity.subsets[subsetKey];
    if (subset.includes(field)) {
      return;
    }

    const newSubset = [...subset];
    if (at === undefined) {
      newSubset.push(field);
    } else {
      newSubset.splice(at, 0, field);
    }

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset)
      .then(({ updated }) => {
        entity.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };
  const omitFieldOnSubset = (subsetKey: string, field: string) => {
    if (!entity) {
      return;
    }
    const subset = entity.subsets[subsetKey];
    if (!subset.includes(field)) {
      return;
    }

    const newSubset = subset.filter((subsetField) => subsetField !== field);

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset)
      .then(({ updated }) => {
        entity.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };

  // Internal 필드 추가/제거 함수
  const appendFieldOnSubsetInternal = (subsetKey: string, field: string) => {
    if (!entity) {
      return;
    }
    const internalSubset = entity.subsetsInternal?.[subsetKey] ?? [];
    if (internalSubset.includes(field)) {
      return;
    }

    const newInternalSubset = [...internalSubset, field];
    // 일반 subset에서 제거
    const newSubset = (entity.subsets[subsetKey] ?? []).filter((f) => f !== field);

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset, newInternalSubset)
      .then(({ updated, updatedInternal }) => {
        entity.subsets[subsetKey] = updated;
        entity.subsetsInternal = entity.subsetsInternal ?? {};
        entity.subsetsInternal[subsetKey] = updatedInternal ?? [];
        refetch();
      })
      .catch(defaultCatch);
  };

  const omitFieldOnSubsetInternal = (subsetKey: string, field: string) => {
    if (!entity) {
      return;
    }
    const internalSubset = entity.subsetsInternal?.[subsetKey] ?? [];
    if (!internalSubset.includes(field)) {
      return;
    }

    const newInternalSubset = internalSubset.filter((f) => f !== field);

    SonamuUIService.modifySubset(entity.id, subsetKey, entity.subsets[subsetKey], newInternalSubset)
      .then(({ updated, updatedInternal }) => {
        entity.subsets[subsetKey] = updated;
        entity.subsetsInternal = entity.subsetsInternal ?? {};
        entity.subsetsInternal[subsetKey] = updatedInternal ?? [];
        refetch();
      })
      .catch(defaultCatch);
  };

  const expandRelationEntity = (at: number) => () => {
    if (!entities || !entity) {
      return;
    }

    const srcRow = entity.flattenSubsetRows[at];
    const relationEntityId = srcRow.relationEntity;
    if (!relationEntityId) {
      return;
    }

    const srcPrefix = [...srcRow.prefixes, srcRow.field].join(".");
    const existsOne = entity.flattenSubsetRows.find((r) =>
      r.prefixes.join(".").startsWith(srcPrefix),
    );
    if (existsOne) {
      return;
    }

    const relEntity = entities.find((et) => et.id === relationEntityId);
    if (!relEntity) {
      return alert(`Cannot find a relation entity named ${relationEntityId}`);
    }

    const newSubsetRows = relEntity.flattenSubsetRows
      .filter((r) => r.prefixes.length === 0)
      .map((r) => ({
        ...r,
        prefixes: [...srcRow.prefixes, srcRow.field],
        has: Object.fromEntries(Object.keys(entity.subsets).map((subsetKey) => [subsetKey, false])),
        isInternal: Object.fromEntries(
          Object.keys(entity.subsets).map((subsetKey) => [subsetKey, false]),
        ),
        isOpen: false,
      }));
    entity.flattenSubsetRows.splice(at + 1, 0, ...newSubsetRows);

    srcRow.isOpen = true;
  };
  const toggleAllFieldsOnSubset = (subsetKey: string, subsetRow?: FlattenSubsetRow) => {
    if (!entity) {
      return;
    }

    const newSubset = (() => {
      const oldSubset = entity.subsets[subsetKey];
      if (subsetRow === undefined) {
        const targetFields = entity.flattenSubsetRows
          .filter((sr) => sr.prefixes.length === 0 && !sr.relationEntity)
          .map((sr) => sr.field);
        const toAppend = targetFields.filter((field) => !entity.subsets[subsetKey].includes(field));
        if (toAppend.length === 0) {
          // 모두 선택된 경우 아무 것도 하지 않음
          return oldSubset;
        } else {
          console.log({ toAppend });
          // 선택 추가
          return unique([...oldSubset, ...toAppend]);
        }
      } else {
        const targetFields = entity.flattenSubsetRows
          .filter(
            (sr) =>
              sr.prefixes.join(".") === subsetRow.prefixes.concat(subsetRow.field).join(".") &&
              !sr.relationEntity,
          )
          .map((sr) => sr.prefixes.concat(sr.field).join("."));
        const toAppend = targetFields.filter((field) => !entity.subsets[subsetKey].includes(field));
        if (toAppend.length === 0) {
          // 모두 선택된 경우 전체 선택 해제
          return oldSubset.filter((field) => targetFields.includes(field) === false);
        } else {
          console.log({ toAppend });
          // 선택 추가
          return unique([...oldSubset, ...toAppend]);
        }
      }
    })();

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset)
      .then(({ updated }) => {
        entity.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };

  // base
  const handleEntityBaseOnEnter = (which: "parentId" | "title" | "table") => {
    return (
      _e: React.KeyboardEvent<HTMLInputElement>,
      { value }: { value: string },
    ): Promise<void> => {
      if (!entity) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        SonamuUIService.modifyEntityBase(entity.id, {
          title: entity.title,
          table: entity.table,
          parentId: entity.parentId === "" ? undefined : entity.parentId,
          [which]: value,
        })
          .then(() => {
            refetch();
            return resolve();
          })
          .catch((e) => {
            return reject(e);
          });
      });
    };
  };

  // props
  const openPropForm = (mode: "add" | "modify", at?: number, focusIndex?: number) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.props[at!];

    openModal(<EntityPropForm entityId={entity.id} oldOne={oldOne} />, {
      onControlledOpen: () => {
        // keySwitch off
        turnKeyHandler(false);

        // focus
        const focusInput = document.querySelector(`.entity-prop-form .focus-${focusIndex} input`);
        if (focusInput) {
          (focusInput as HTMLInputElement).focus();
        }
      },
      onControlledClose: () => {
        // keySwitch on
        turnKeyHandler(true);
      },
      onCompleted: async (data: unknown) => {
        if (oldOne) {
          await SonamuUIService.modifyProp(entity.id, data as EntityProp, at!);
        } else {
          await SonamuUIService.createProp(entity.id, data as EntityProp, at);
        }

        refetch();
        setTimeout(() => {
          setCursor({
            ...cursor,
            sheet: "props",
            y: at! + 1,
          });
        }, 100);
      },
    });
  };
  const confirmDelProp = async (at: number) => {
    if (!entity) {
      return;
    }
    const answer = confirm(`Are you sure to delete "${entity.props[at].name}"?`);
    if (!answer) {
      return;
    }

    await SonamuUIService.delProp(entity.id, at);
    refetch();
    setTimeout(() => {
      setCursor({
        ...cursor,
        sheet: "props",
        y: Math.min(at, entity.props.length - 1),
      });
    });
  };

  // indexes
  const openIndexForm = (mode: "add" | "modify", at?: number, focusIndex: number = 0) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.indexes[at!];

    openModal(<EntityIndexForm entityId={entity.id} table={entity.table} oldOne={oldOne} />, {
      onControlledOpen: () => {
        // keySwitch off
        turnKeyHandler(false);

        // focus
        const focusInput = document.querySelector(`.entity-index-form .focus-${focusIndex} input`);
        if (focusInput) {
          (focusInput as HTMLInputElement).focus();
        }
      },
      onControlledClose: () => {
        // keySwitch on
        turnKeyHandler(true);
      },
      onCompleted: (data: unknown) => {
        const newIndexes = (() => {
          const newIndexes = [...entity.indexes];
          if (mode === "add") {
            at ??= newIndexes.length - 1;
            newIndexes.splice(at + 1, 0, data as EntityIndex);
            return newIndexes;
          } else {
            return newIndexes.map((index, __index) =>
              __index === at ? (data as EntityIndex) : index,
            );
          }
        })();

        SonamuUIService.modifyIndexes(entity.id, newIndexes)
          .then(({ updated }) => {
            entity.indexes = updated;
            refetch();
            setTimeout(() => {
              setCursor({
                ...cursor,
                sheet: "indexes",
                y: at! + 1,
              });
            }, 100);
          })
          .catch(defaultCatch);
      },
    });
  };
  const confirmDelIndex = (at: number) => {
    if (!entity) {
      return;
    }
    const answer = confirm(`Are you sure to delete the index"?`);
    if (!answer) {
      return;
    }

    const newIndexes = entity.indexes.filter((_index, index) => index !== at);
    SonamuUIService.modifyIndexes(entity.id, newIndexes)
      .then(({ updated }) => {
        entity.indexes = updated;
        refetch();
        setTimeout(() => {
          setCursor({
            ...cursor,
            sheet: "indexes",
            y: Math.min(at, entity.indexes.length - 1),
          });
        });
      })
      .catch(defaultCatch);
  };

  // subsets
  const addSubsetKey = () => {
    const subsetKey = prompt("Subset key?");
    if (!subsetKey) {
      return;
    }

    SonamuUIService.modifySubset(entity!.id, subsetKey, ["id"])
      .then(({ updated }) => {
        entity!.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };
  const delSubset = (subsetKey: string) => {
    const answer = confirm(`Are you sure to delete "${subsetKey}"?`);
    if (!answer) {
      return;
    }

    SonamuUIService.delSubset(entity!.id, subsetKey)
      .then((_res) => {
        delete entity!.subsets[subsetKey];
        refetch();
      })
      .catch(defaultCatch);
  };

  // enums
  const addEnumLabelRow = (enumId: string, cursorY?: number) => {
    if (!entity) {
      return;
    }

    cursorY ??= Object.keys(enumLabelsArray[enumId]).length - 1;
    enumLabelsArray[enumId].push({
      key: "",
      label: "",
    });
    setCursor({
      sheet: `enumLabels-${enumId}`,
      y: cursorY + 1,
      x: 0,
    });
    setFocusedCursor({ sheet: `enumLabels-${enumId}`, y: cursorY + 1, x: 0 });
  };
  const modifyEnumLabels = (
    enumId: string,
    at: number,
    which: "key" | "label",
    newValue: string,
  ) => {
    if (!entity) {
      return;
    }

    enumLabelsArray[enumId] = enumLabelsArray[enumId].map((item, index) => {
      return index === at
        ? {
            ...item,
            [which]: newValue,
          }
        : item;
    });
    SonamuUIService.modifyEnumLabels(entity.id, enumLabelsArrayToEnumLabels(enumLabelsArray))
      .then(({ updated }) => {
        entity.enumLabels = updated;
        refetch();
      })
      .catch(defaultCatch);
  };
  const editEnumId = (oldEnumId: string, newEnumId: string) => {
    if (!entity) {
      return;
    }

    SonamuUIService.modifyEnumId(entity.id, {
      before: oldEnumId,
      after: newEnumId,
    })
      .then(() => {
        refetch();
      })
      .catch(defaultCatch);
  };
  const confirmDelEnum = (enumId: string) => {
    if (!entity) {
      return;
    }
    const answer = confirm(`Are you sure to delete "${enumId}"?`);
    if (!answer) {
      return;
    }

    SonamuUIService.deleteEnumId({ entityId: entity.id, enumId })
      .then(() => {
        refetch();
      })
      .catch(defaultCatch);
  };
  const openCreateNewEnum = () => {
    if (!entity) {
      return;
    }

    const newEnumId = prompt("New enum id?");
    if (!newEnumId) {
      return;
    }

    SonamuUIService.createEnumId({ entityId: entity.id, newEnumId })
      .then(() => {
        refetch();
      })
      .catch(defaultCatch);
  };

  // Props Drag&Drop
  const dragStartPropIndex = useRef<number | null>(null);
  const [dragEnterPropIndex, setDragEnterPropIndex] = useState<number | null>();

  return (
    <div className="entities-detail">
      {isLoading && <div>Loading</div>}
      {entity && (
        <>
          <div className="entity-base">
            <h3>
              <span>
                Entity: <strong style={{ color: "green" }}>{entity.id}</strong>
              </span>
              <Button
                size="xs"
                variant="destructive"
                icon={<Trash2Icon />}
                content="Delete"
                className="btn-del-entity"
                onClick={() => delEntity()}
              />
            </h3>
            <form className="ui form">
              <div className="equal width fields">
                <div className="field">
                  <label>ParentID</label>
                  <EditableInput
                    value={entity.parentId ?? ""}
                    onChange={handleEntityBaseOnEnter("parentId")}
                  />
                </div>
                <div className="field">
                  <label>Title</label>
                  <EditableInput value={entity.title} onChange={handleEntityBaseOnEnter("title")} />
                </div>
                <div className="field">
                  <label>TableName</label>
                  <EditableInput value={entity.table} onChange={handleEntityBaseOnEnter("table")} />
                </div>
                <div className="field">
                  {/* <EditableInput
                    originValue={entity.table}
                    onEnter={handleEntityBaseOnEnter}
                  /> */}
                </div>
              </div>
            </form>
          </div>
          <div className="props-and-indexes">
            <div className="props">
              <h3>Props</h3>
              <table className="ui table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Desc</th>
                    <th>Type</th>
                    <th>Nullable</th>
                    <th>With/As</th>
                    <th>Default</th>
                    <th>Filter</th>
                  </tr>
                </thead>
                <tbody>
                  {entity.props.map((prop, propIndex) => (
                    <tr
                      id={`prop-${prop.name}`}
                      key={propIndex}
                      {...regRow(
                        "props",
                        propIndex,
                        classNames({
                          "drag-enter": dragEnterPropIndex === propIndex,
                        }),
                      )}
                      draggable={true}
                      onDragStart={() => {
                        dragStartPropIndex.current = propIndex;
                      }}
                      onDragEnter={(e: React.DragEvent<HTMLTableRowElement>) => {
                        e.preventDefault();
                        setDragEnterPropIndex(propIndex);
                      }}
                      onDragEnd={() => {
                        const at = dragStartPropIndex.current;
                        const to = dragEnterPropIndex;
                        if (!entity || !at || !to) {
                          return;
                        }

                        SonamuUIService.moveProp(entity.id, at, to).then(() => {
                          refetch();

                          dragStartPropIndex.current = null;
                          setDragEnterPropIndex(null);
                        });
                      }}
                    >
                      <td {...regCell("props", propIndex, 0)}>{prop.name}</td>
                      <td {...regCell("props", propIndex, 1)}>{prop.desc}</td>
                      <td {...regCell("props", propIndex, 2)}>
                        {prop.type} {prop.type === "string" && prop.length && <>({prop.length}) </>}
                        {(prop.type === "numeric" ||
                          (prop.type === "number" && prop.numberType === "numeric")) && (
                          <>
                            ({prop.precision},{prop.scale}){" "}
                          </>
                        )}
                      </td>
                      <td {...regCell("props", propIndex, 3)}>
                        {prop.nullable && <span className="ui label">NULL</span>}
                      </td>
                      <td {...regCell("props", propIndex, 4)}>
                        {prop.type === "enum" && <span className="ui label">{prop.id}</span>}
                        {(prop.type === "json" || prop.type === "virtual") && (
                          <span className="ui label">{prop.id}</span>
                        )}
                        {prop.type === "relation" && (
                          <span
                            className="ui label"
                            color={prop.relationType.endsWith("ToOne") ? "orange" : "purple"}
                          >
                            {prop.relationType}: {prop.with}
                          </span>
                        )}
                      </td>

                      <td {...regCell("props", propIndex, 5)}>
                        {prop.type !== "relation" && <>{prop.dbDefault}</>}
                      </td>
                      <td {...regCell("props", propIndex, 6)}>{prop.toFilter && <CheckIcon />}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={7} className="footer-buttons">
                      <Button
                        variant="blue"
                        icon={<PlusIcon />}
                        onClick={() => openPropForm("add", undefined, 2)}
                      >
                        Add a prop
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="indexes">
              <h3>Indexes</h3>
              <table className="ui table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Columns</th>
                  </tr>
                </thead>
                <tbody>
                  {entity.indexes.map((index, indexIndex) => (
                    <tr key={indexIndex} {...regRow("indexes", indexIndex)}>
                      <td {...regCell("indexes", indexIndex, 0)}>
                        <strong>{index.type}</strong>
                      </td>
                      <td {...regCell("indexes", indexIndex, 1)}>
                        {index.columns.map((col, colIndex) => (
                          <span className="ui label" key={colIndex}>
                            {col.name}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} className="footer-buttons">
                      <Button
                        variant="blue"
                        icon={<PlusIcon />}
                        onClick={() => openIndexForm("add", undefined, 0)}
                      >
                        Add a index
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="enums-and-subsets">
            {entity && Object.keys(enumLabelsArray).length > 0 && (
              <div className="enums">
                <h3>
                  Enums <Button size="xs" icon={<PlusIcon />} onClick={() => openCreateNewEnum()} />
                </h3>
                <div className="enums-list">
                  {Object.keys(enumLabelsArray).map((enumId, enumsIndex) => (
                    <div className="enums-table" key={enumsIndex}>
                      <table className="ui table" id={`enum-${enumId}`}>
                        <thead>
                          <tr>
                            <th
                              colSpan={2}
                              onDoubleClick={() => {
                                const newEnumId = prompt("You want to change the EnumID?", enumId);
                                if (!newEnumId) {
                                  return;
                                }
                                editEnumId(enumId, newEnumId);
                              }}
                            >
                              {enumId}
                              <Button
                                size="xs"
                                icon={<Trash2Icon />}
                                variant="destructive"
                                className="btn-del-enum"
                                onClick={() => confirmDelEnum(enumId)}
                              />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {enumLabelsArray[enumId].map(({ key, label }, enumLabelIndex) => (
                            <tr
                              id={`enum-${enumId}-${key}`}
                              key={enumLabelIndex}
                              {...regRow(`enumLabels-${enumId}`, enumLabelIndex)}
                            >
                              <td {...regCell(`enumLabels-${enumId}`, enumLabelIndex, 0)}>
                                <SheetCellInput
                                  editable={isFocused(`enumLabels-${enumId}`, enumLabelIndex, 0)}
                                  initialValue={key}
                                  onChange={(newValue) => {
                                    setFocusedCursor(null);
                                    if (newValue !== key) {
                                      modifyEnumLabels(enumId, enumLabelIndex, "key", newValue);

                                      setFocusedCursor({
                                        sheet: `enumLabels-${enumId}`,
                                        y: enumLabelIndex,
                                        x: 1,
                                      });
                                    }
                                  }}
                                />
                              </td>
                              <td {...regCell(`enumLabels-${enumId}`, enumLabelIndex, 1)}>
                                <SheetCellInput
                                  editable={isFocused(`enumLabels-${enumId}`, enumLabelIndex, 1)}
                                  initialValue={label}
                                  onChange={(newValue) => {
                                    setFocusedCursor(null);
                                    if (newValue !== label) {
                                      modifyEnumLabels(enumId, enumLabelIndex, "label", newValue);
                                    }
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={2}>
                              <Button
                                size="xs"
                                variant="default"
                                icon={<PlusIcon />}
                                className="btn-add-enum-label"
                                onClick={() => addEnumLabelRow(enumId)}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {entity && Object.keys(entity.subsets).length > 0 && (
              <div className="subsets">
                <h3>
                  Subsets{" "}
                  <Button
                    size="xs"
                    icon={<PlusIcon />}
                    variant="default"
                    onClick={() => addSubsetKey()}
                  />
                </h3>
                {entity && entity.flattenSubsetRows.length > 0 && (
                  <table className="ui table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <th key={subsetKey}>
                            Subset{subsetKey}{" "}
                            {subsetKey !== "A" && (
                              <Button
                                icon={<Trash2Icon />}
                                size="xs"
                                variant="destructive"
                                className="btn-del-subset"
                                onClick={() => delSubset(subsetKey)}
                              />
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td></td>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <td key={subsetKey}>
                            <Button
                              size="xs"
                              style={{ fontSize: ".5em" }}
                              onClick={() => toggleAllFieldsOnSubset(subsetKey)}
                            />
                          </td>
                        ))}
                      </tr>
                      {entity.flattenSubsetRows.map((subsetRow, subsetRowIndex) => (
                        <tr
                          id={[...subsetRow.prefixes, subsetRow.field].join(".")}
                          key={subsetRowIndex}
                          {...regRow("subsets", subsetRowIndex)}
                        >
                          <td {...regCell("subsets", subsetRowIndex, 0)}>
                            <span style={{ color: "silver" }}>
                              {subsetRow.prefixes.join(" > ")}
                              {subsetRow.prefixes.length > 0 && " > "}
                            </span>
                            {subsetRow.field}
                            {subsetRow.relationEntity && (
                              <Button
                                variant="default"
                                size="xs"
                                className="btn-relation-entity"
                                onClick={expandRelationEntity(subsetRowIndex)}
                                disabled={subsetRow.isOpen}
                              >
                                {subsetRow.relationEntity}
                              </Button>
                            )}
                          </td>
                          {Object.keys(entity.subsets).map((subsetKey) => (
                            <td key={subsetKey}>
                              {subsetRow.relationEntity ? (
                                // biome-ignore lint/complexity/noUselessFragments: 필요한데?
                                <>
                                  {subsetRow.isOpen && (
                                    <Button
                                      size="xs"
                                      style={{ fontSize: ".5em" }}
                                      onClick={() => toggleAllFieldsOnSubset(subsetKey, subsetRow)}
                                    />
                                  )}
                                </>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Checkbox
                                    checked={subsetRow.has[subsetKey]}
                                    onCheckedChange={(checked) => {
                                      const field = [...subsetRow.prefixes, subsetRow.field].join(
                                        ".",
                                      );
                                      if (checked === false) {
                                        // 서브셋의 필드 삭제
                                        omitFieldOnSubset(subsetKey, field);
                                      } else if (checked === true) {
                                        // 서브셋에 필드 추가 (internal에서 제거)
                                        if (subsetRow.isInternal?.[subsetKey]) {
                                          omitFieldOnSubsetInternal(subsetKey, field);
                                        }
                                        appendFieldOnSubset(subsetKey, field);
                                      }
                                    }}
                                  />
                                  <Button
                                    size="xs"
                                    variant={
                                      subsetRow.isInternal?.[subsetKey] ? "default" : "ghost"
                                    }
                                    style={{
                                      fontSize: ".5em",
                                      padding: "4px 6px",
                                      backgroundColor: subsetRow.isInternal?.[subsetKey]
                                        ? "#f97316"
                                        : undefined,
                                      color: subsetRow.isInternal?.[subsetKey]
                                        ? "white"
                                        : undefined,
                                    }}
                                    title="Internal: 쿼리만 수행하고 결과 타입에서 제외"
                                    onClick={() => {
                                      const field = [...subsetRow.prefixes, subsetRow.field].join(
                                        ".",
                                      );
                                      if (subsetRow.isInternal?.[subsetKey]) {
                                        // internal 해제
                                        omitFieldOnSubsetInternal(subsetKey, field);
                                      } else {
                                        // internal 설정 (일반에서 제거)
                                        if (subsetRow.has[subsetKey]) {
                                          omitFieldOnSubset(subsetKey, field);
                                        }
                                        appendFieldOnSubsetInternal(subsetKey, field);
                                      }
                                    }}
                                  >
                                    I
                                  </Button>
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
