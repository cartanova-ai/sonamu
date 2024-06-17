import { useNavigate, useParams } from "react-router-dom";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { Button, Checkbox, Form, Icon, Label, Table } from "semantic-ui-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultCatch } from "../../services/sonamu.shared";
import { EntityIndex, EntityProp, FlattenSubsetRow } from "sonamu";
import { useCommonModal } from "../../components/core/CommonModal";
import { EntityPropForm } from "./_prop_form";
import { EntityIndexForm } from "./_index_form";
import { SheetCellInput } from "../../components/SheetCellInput";
import { useSheetTable } from "../../components/useSheetTable";
import { EditableInput } from "../../components/EditableInput";
import { EntitySelector } from "./_entity_selector";
import classNames from "classnames";
import { uniq } from "lodash";

type EntitiesShowPageProps = {};
export default function EntitiesShowPage({}: EntitiesShowPageProps) {
  const { data, error, mutate } = SonamuUIService.useEntities();
  const { entities } = data ?? {};
  const isLoading = !error && !data;

  // naviagte
  const navigate = useNavigate();

  // params & entity
  const params = useParams<{ entityId: string }>();

  const entity =
    entities?.find((entity) => entity.id === params.entityId) ?? null;
  useEffect(() => {
    setCursor({
      sheet: "props",
      y: 0,
      x: 0,
    });
  }, [params.entityId]);
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
        mutate();
        navigate("/entities");
      })
      .catch(defaultCatch);
  };

  // useSheetTable
  const {
    regRow,
    regCell,
    cursor,
    setCursor,
    setFocusedCursor,
    turnKeyHandler,
    isFocused,
  } = useSheetTable({
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
            return entity.props.findIndex((prop) =>
              prop.name.startsWith(keyword)
            );
          } else if (sheet === "indexes") {
            return entity.indexes.findIndex((index) =>
              index.columns.join(",").includes(keyword)
            );
          } else if (sheet === "subsets") {
            return entity.flattenSubsetRows.findIndex((subsetRow) =>
              subsetRow.field.startsWith(keyword)
            );
          } else if (sheet.startsWith("enumLabels-")) {
            const enumId = sheet.replace("enumLabels-", "");
            return enumLabelsArray[enumId].findIndex(
              (enumLabel) =>
                enumLabel.key.startsWith(keyword) ||
                enumLabel.label.startsWith(keyword)
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
                enumLabelsArrayToEnumLabels(enumLabelsArray)
              )
                .then(({ updated }) => {
                  entity.enumLabels = updated;
                  mutate();
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
                navigate(`/entities/${entityId}`);
              },
            });
          }
          break;
      }
      return true;
    },
  });
  // commonModal
  const { openModal } = useCommonModal();

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
      ])
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
      ])
    );
  };
  const appendFieldOnSubset = (
    subsetKey: string,
    field: string,
    at?: number
  ) => {
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
        mutate();
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
        mutate();
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
      r.prefixes.join(".").startsWith(srcPrefix)
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
        has: Object.fromEntries(
          Object.keys(entity.subsets).map((subsetKey) => [subsetKey, false])
        ),
        isOpen: false,
      }));
    entity.flattenSubsetRows.splice(at + 1, 0, ...newSubsetRows);

    srcRow.isOpen = true;
  };
  const toggleAllFieldsOnSubset = (
    subsetKey: string,
    subsetRow?: FlattenSubsetRow
  ) => {
    if (!entity) {
      return;
    }

    const newSubset = (() => {
      const oldSubset = entity.subsets[subsetKey];
      if (subsetRow === undefined) {
        const targetFields = entity.flattenSubsetRows
          .filter((sr) => sr.prefixes.length === 0 && !sr.relationEntity)
          .map((sr) => sr.field);
        const toAppend = targetFields.filter(
          (field) => !entity.subsets[subsetKey].includes(field)
        );
        if (toAppend.length === 0) {
          // 모두 선택된 경우 아무 것도 하지 않음
          return oldSubset;
        } else {
          console.log({ toAppend });
          // 선택 추가
          return uniq([...oldSubset, ...toAppend]);
        }
      } else {
        const targetFields = entity.flattenSubsetRows
          .filter(
            (sr) =>
              sr.prefixes.join(".") ===
                subsetRow.prefixes.concat(subsetRow.field).join(".") &&
              !sr.relationEntity
          )
          .map((sr) => sr.prefixes.concat(sr.field).join("."));
        const toAppend = targetFields.filter(
          (field) => !entity.subsets[subsetKey].includes(field)
        );
        if (toAppend.length === 0) {
          // 모두 선택된 경우 전체 선택 해제
          return oldSubset.filter(
            (field) => targetFields.includes(field) === false
          );
        } else {
          console.log({ toAppend });
          // 선택 추가
          return uniq([...oldSubset, ...toAppend]);
        }
      }
    })();

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset)
      .then(({ updated }) => {
        entity.subsets[subsetKey] = updated;
        mutate();
      })
      .catch(defaultCatch);
  };

  // base
  const handleEntityBaseOnEnter = (which: "parentId" | "title" | "table") => {
    return (
      _e: React.KeyboardEvent<HTMLInputElement>,
      { value }: { value: string }
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
            mutate();
            return resolve();
          })
          .catch((e) => {
            return reject(e);
          });
      });
    };
  };

  // props
  const openPropForm = (
    mode: "add" | "modify",
    at?: number,
    focusIndex?: number
  ) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.props[at!];

    openModal(<EntityPropForm entityId={entity.id} oldOne={oldOne} />, {
      onControlledOpen: () => {
        // keySwitch off
        turnKeyHandler(false);

        // focus
        const focusInput = document.querySelector(
          `.entity-prop-form .focus-${focusIndex} input`
        );
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

        mutate();
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
    const answer = confirm(
      `Are you sure to delete "${entity.props[at].name}"?`
    );
    if (!answer) {
      return;
    }

    await SonamuUIService.delProp(entity.id, at);
    mutate();
    setTimeout(() => {
      setCursor({
        ...cursor,
        sheet: "props",
        y: Math.min(at, entity.props.length - 1),
      });
    });
  };

  // indexes
  const openIndexForm = (
    mode: "add" | "modify",
    at?: number,
    focusIndex: number = 0
  ) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.indexes[at!];

    openModal(<EntityIndexForm entityId={entity.id} oldOne={oldOne} />, {
      onControlledOpen: () => {
        // keySwitch off
        turnKeyHandler(false);

        // focus
        const focusInput = document.querySelector(
          `.entity-index-form .focus-${focusIndex} input`
        );
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
              __index === at ? (data as EntityIndex) : index
            );
          }
        })();

        SonamuUIService.modifyIndexes(entity.id, newIndexes)
          .then(({ updated }) => {
            entity.indexes = updated;
            mutate();
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
        mutate();
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
        mutate();
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
        mutate();
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
    newValue: string
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
    SonamuUIService.modifyEnumLabels(
      entity.id,
      enumLabelsArrayToEnumLabels(enumLabelsArray)
    )
      .then(({ updated }) => {
        entity.enumLabels = updated;
        mutate();
      })
      .catch(defaultCatch);
  };
  const editEnumId = (oldEnumId: string, newEnumId: string) => {
    if (!entity) {
      return;
    }
    const newEnumLabelsArray = Object.fromEntries(
      Object.entries(enumLabelsArray).map(([enumId, enumLabels]) => [
        enumId === oldEnumId ? newEnumId : enumId,
        enumLabels,
      ])
    );

    SonamuUIService.modifyEnumLabels(
      entity.id,
      enumLabelsArrayToEnumLabels(newEnumLabelsArray)
    )
      .then(({ updated }) => {
        entity.enumLabels = updated;
        mutate();
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

    const newEnumLabelsArray = Object.fromEntries(
      Object.entries(enumLabelsArray).filter(
        ([_enumId, _enumLabels]) => _enumId !== enumId
      )
    );

    SonamuUIService.modifyEnumLabels(
      entity.id,
      enumLabelsArrayToEnumLabels(newEnumLabelsArray)
    )
      .then(({ updated }) => {
        entity.enumLabels = updated;
        mutate();
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

    const newEnumLabelsArray = Object.fromEntries(
      Object.entries(enumLabelsArray).concat([[newEnumId, []]])
    );
    SonamuUIService.modifyEnumLabels(
      entity.id,
      enumLabelsArrayToEnumLabels(newEnumLabelsArray)
    )
      .then(({ updated }) => {
        entity.enumLabels = updated;
        mutate();
      })
      .catch(defaultCatch);
  };

  // Props Drag&Drop
  const dragStartPropIndex = useRef<number | null>();
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
                size="mini"
                color="red"
                icon="trash"
                content="Delete"
                className="btn-del-entity"
                onClick={() => delEntity()}
              />
            </h3>
            <Form>
              <Form.Group widths="equal">
                <Form.Field>
                  <label>ParentID</label>
                  <EditableInput
                    value={entity.parentId ?? ""}
                    onChange={handleEntityBaseOnEnter("parentId")}
                  />
                </Form.Field>
                <Form.Field>
                  <label>Title</label>
                  <EditableInput
                    value={entity.title}
                    onChange={handleEntityBaseOnEnter("title")}
                  />
                </Form.Field>
                <Form.Field>
                  <label>TableName</label>
                  <EditableInput
                    value={entity.table}
                    onChange={handleEntityBaseOnEnter("table")}
                  />
                </Form.Field>
                <Form.Field>
                  {/* <EditableInput
                    originValue={entity.table}
                    onEnter={handleEntityBaseOnEnter}
                  /> */}
                </Form.Field>
              </Form.Group>
            </Form>
          </div>
          <div className="props-and-indexes">
            <div className="props">
              <h3>Props</h3>
              <Table celled selectable>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Name</Table.HeaderCell>
                    <Table.HeaderCell>Desc</Table.HeaderCell>
                    <Table.HeaderCell>Type</Table.HeaderCell>
                    <Table.HeaderCell>Nullable</Table.HeaderCell>
                    <Table.HeaderCell>With/As</Table.HeaderCell>
                    <Table.HeaderCell>Default</Table.HeaderCell>
                    <Table.HeaderCell>Filter</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {entity.props.map((prop, propIndex) => (
                    <Table.Row
                      id={`prop-${prop.name}`}
                      key={propIndex}
                      {...regRow(
                        "props",
                        propIndex,
                        classNames({
                          "drag-enter": dragEnterPropIndex === propIndex,
                        })
                      )}
                      draggable={true}
                      onDragStart={() => {
                        dragStartPropIndex.current = propIndex;
                      }}
                      onDragEnter={(e: DragEvent) => {
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
                          mutate();

                          dragStartPropIndex.current = null;
                          setDragEnterPropIndex(null);
                        });
                      }}
                    >
                      <Table.Cell {...regCell("props", propIndex, 0)}>
                        {prop.name}
                      </Table.Cell>
                      <Table.Cell {...regCell("props", propIndex, 1)}>
                        {prop.desc}
                      </Table.Cell>
                      <Table.Cell
                        {...regCell("props", propIndex, 2)}
                        collapsing
                      >
                        {prop.type}{" "}
                        {(prop.type === "integer" ||
                          prop.type === "bigInteger" ||
                          prop.type === "float" ||
                          prop.type === "double" ||
                          prop.type === "decimal") &&
                          prop.unsigned && <>unsigned </>}
                        {(prop.type === "string" || prop.type === "enum") && (
                          <>({prop.length}) </>
                        )}
                        {(prop.type === "float" ||
                          prop.type === "double" ||
                          prop.type === "decimal") && (
                          <>
                            ({prop.precision},{prop.scale}){" "}
                          </>
                        )}
                      </Table.Cell>
                      <Table.Cell
                        {...regCell("props", propIndex, 3)}
                        collapsing
                      >
                        {prop.nullable && <Label>NULL</Label>}
                      </Table.Cell>
                      <Table.Cell
                        {...regCell("props", propIndex, 4)}
                        collapsing
                      >
                        {prop.type === "enum" && (
                          <>
                            <Label color="teal">{prop.id}</Label>
                          </>
                        )}
                        {(prop.type === "json" || prop.type === "virtual") && (
                          <>
                            <Label color="brown">{prop.id}</Label>
                          </>
                        )}
                        {prop.type === "relation" && (
                          <>
                            <Label
                              color={
                                prop.relationType.endsWith("ToOne")
                                  ? "orange"
                                  : "purple"
                              }
                            >
                              {prop.relationType}: {prop.with}
                            </Label>
                          </>
                        )}
                      </Table.Cell>

                      <Table.Cell
                        {...regCell("props", propIndex, 5)}
                        collapsing
                      >
                        {prop.type !== "relation" && <>{prop.dbDefault}</>}
                      </Table.Cell>
                      <Table.Cell
                        {...regCell("props", propIndex, 6)}
                        collapsing
                      >
                        {prop.toFilter && <Icon name="check" />}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  <Table.Row>
                    <Table.Cell colSpan={7} className="footer-buttons">
                      <Button
                        color="blue"
                        content="Add a prop"
                        icon="plus"
                        size="mini"
                        onClick={() => openPropForm("add", undefined, 2)}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table>
            </div>
            <div className="indexes">
              <h3>Indexes</h3>
              <Table celled selectable>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Type</Table.HeaderCell>
                    <Table.HeaderCell>Columns</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {entity.indexes.map((index, indexIndex) => (
                    <Table.Row
                      key={indexIndex}
                      {...regRow("indexes", indexIndex)}
                    >
                      <Table.Cell
                        {...regCell("indexes", indexIndex, 0)}
                        collapsing
                      >
                        <strong>{index.type}</strong>
                      </Table.Cell>
                      <Table.Cell {...regCell("indexes", indexIndex, 1)}>
                        {index.columns.map((col, colIndex) => (
                          <Label key={colIndex}>{col}</Label>
                        ))}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  <Table.Row>
                    <Table.Cell colSpan={2} className="footer-buttons">
                      <Button
                        color="blue"
                        content="Add a index"
                        icon="plus"
                        size="mini"
                        onClick={() => openIndexForm("add", undefined, 0)}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table>
            </div>
          </div>
          <div className="enums-and-subsets">
            {entity && Object.keys(enumLabelsArray).length > 0 && (
              <div className="enums">
                <h3>
                  Enums{" "}
                  <Button
                    size="mini"
                    icon="plus"
                    color="blue"
                    onClick={() => openCreateNewEnum()}
                  />
                </h3>
                <div className="enums-list">
                  {Object.keys(enumLabelsArray).map((enumId, enumsIndex) => (
                    <div className="enums-table" key={enumsIndex}>
                      <Table celled selectable id={`enum-${enumId}`}>
                        <Table.Header>
                          <Table.Row>
                            <Table.HeaderCell
                              colSpan={2}
                              onDoubleClick={() => {
                                const newEnumId = prompt(
                                  "You want to change the EnumID?",
                                  enumId
                                );
                                if (!newEnumId) {
                                  return;
                                }
                                editEnumId(enumId, newEnumId);
                              }}
                            >
                              {enumId}
                              <Button
                                size="mini"
                                icon="trash"
                                color="red"
                                className="btn-del-enum"
                                onClick={() => confirmDelEnum(enumId)}
                              />
                            </Table.HeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {enumLabelsArray[enumId].map(
                            ({ key, label }, enumLabelIndex) => (
                              <Table.Row
                                id={`enum-${enumId}-${key}`}
                                key={enumLabelIndex}
                                {...regRow(
                                  `enumLabels-${enumId}`,
                                  enumLabelIndex
                                )}
                              >
                                <Table.Cell
                                  {...regCell(
                                    `enumLabels-${enumId}`,
                                    enumLabelIndex,
                                    0
                                  )}
                                  collapsing
                                >
                                  <SheetCellInput
                                    editable={isFocused(
                                      `enumLabels-${enumId}`,
                                      enumLabelIndex,
                                      0
                                    )}
                                    initialValue={key}
                                    onChange={(newValue) => {
                                      setFocusedCursor(null);
                                      if (newValue !== key) {
                                        modifyEnumLabels(
                                          enumId,
                                          enumLabelIndex,
                                          "key",
                                          newValue
                                        );

                                        setFocusedCursor({
                                          sheet: `enumLabels-${enumId}`,
                                          y: enumLabelIndex,
                                          x: 1,
                                        });
                                      }
                                    }}
                                  />
                                </Table.Cell>
                                <Table.Cell
                                  {...regCell(
                                    `enumLabels-${enumId}`,
                                    enumLabelIndex,
                                    1
                                  )}
                                >
                                  <SheetCellInput
                                    editable={isFocused(
                                      `enumLabels-${enumId}`,
                                      enumLabelIndex,
                                      1
                                    )}
                                    initialValue={label}
                                    onChange={(newValue) => {
                                      setFocusedCursor(null);
                                      if (newValue !== label) {
                                        modifyEnumLabels(
                                          enumId,
                                          enumLabelIndex,
                                          "label",
                                          newValue
                                        );
                                      }
                                    }}
                                  />
                                </Table.Cell>
                              </Table.Row>
                            )
                          )}
                          <Table.Row>
                            <Table.Cell colSpan={2}>
                              <Button
                                size="mini"
                                color="green"
                                icon="plus"
                                className="btn-add-enum-label"
                                onClick={() => addEnumLabelRow(enumId)}
                              />
                            </Table.Cell>
                          </Table.Row>
                        </Table.Body>
                      </Table>
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
                    size="mini"
                    icon="plus"
                    color="blue"
                    onClick={() => addSubsetKey()}
                  />
                </h3>
                {entity && entity.flattenSubsetRows.length > 0 && (
                  <Table celled selectable>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Field</Table.HeaderCell>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <Table.HeaderCell key={subsetKey} collapsing>
                            Subset{subsetKey}{" "}
                            {subsetKey !== "A" && (
                              <Button
                                icon="trash"
                                size="mini"
                                color="red"
                                className="btn-del-subset"
                                onClick={() => delSubset(subsetKey)}
                              />
                            )}
                          </Table.HeaderCell>
                        ))}
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      <Table.Row>
                        <Table.Cell></Table.Cell>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <Table.Cell key={subsetKey}>
                            <Button
                              size="mini"
                              content="!"
                              circular
                              style={{ fontSize: ".5em" }}
                              onClick={() => toggleAllFieldsOnSubset(subsetKey)}
                            />
                          </Table.Cell>
                        ))}
                      </Table.Row>
                      {entity.flattenSubsetRows.map(
                        (subsetRow, subsetRowIndex) => (
                          <Table.Row
                            id={[...subsetRow.prefixes, subsetRow.field].join(
                              "."
                            )}
                            key={subsetRowIndex}
                            {...regRow("subsets", subsetRowIndex)}
                          >
                            <Table.Cell
                              {...regCell("subsets", subsetRowIndex, 0)}
                            >
                              <span style={{ color: "silver" }}>
                                {subsetRow.prefixes.join(" > ")}
                                {subsetRow.prefixes.length > 0 && " > "}
                              </span>
                              {subsetRow.field}
                              {subsetRow.relationEntity && (
                                <Button
                                  color="olive"
                                  size="mini"
                                  className="btn-relation-entity"
                                  onClick={expandRelationEntity(subsetRowIndex)}
                                  icon={subsetRow.isOpen ? "minus" : "plus"}
                                  disabled={subsetRow.isOpen}
                                  content={subsetRow.relationEntity}
                                />
                              )}
                            </Table.Cell>
                            {Object.keys(entity.subsets).map((subsetKey) => (
                              <Table.Cell key={subsetKey}>
                                {subsetRow.relationEntity ? (
                                  <>
                                    {subsetRow.isOpen && (
                                      <Button
                                        size="mini"
                                        content="!"
                                        circular
                                        style={{ fontSize: ".5em" }}
                                        onClick={() =>
                                          toggleAllFieldsOnSubset(
                                            subsetKey,
                                            subsetRow
                                          )
                                        }
                                      />
                                    )}
                                  </>
                                ) : (
                                  <Checkbox
                                    checked={subsetRow.has[subsetKey]}
                                    onChange={(_e, data) => {
                                      if (data.checked === false) {
                                        // 서브셋의 필드 삭제
                                        omitFieldOnSubset(
                                          subsetKey,
                                          [
                                            ...subsetRow.prefixes,
                                            subsetRow.field,
                                          ].join(".")
                                        );
                                      } else if (data.checked === true) {
                                        // 서브셋에 필드 추가
                                        appendFieldOnSubset(
                                          subsetKey,
                                          [
                                            ...subsetRow.prefixes,
                                            subsetRow.field,
                                          ].join(".")
                                        );
                                      }
                                    }}
                                  />
                                )}
                              </Table.Cell>
                            ))}
                          </Table.Row>
                        )
                      )}
                    </Table.Body>
                  </Table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
