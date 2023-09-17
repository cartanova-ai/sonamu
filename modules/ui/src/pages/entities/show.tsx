import { useNavigate, useParams } from "react-router-dom";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { Button, Checkbox, Input, Label, Table } from "semantic-ui-react";
import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { uniq } from "lodash";
import { defaultCatch } from "../../services/sonamu.shared";
import { EntityIndex, EntityProp } from "sonamu";
import { useCommonModal } from "../../components/core/CommonModal";
import { EntityPropForm } from "./_prop_form";
import { EntityIndexForm } from "./_index_form";
import { EditableInput } from "../../components/EditableInput";

type EntitiesShowPageProps = {};
export default function EntitiesShowPage({}: EntitiesShowPageProps) {
  const { data, error, mutate } = SonamuUIService.useEntities();
  const { entities } = data ?? {};
  const isLoading = !error && !data;

  // navigate
  const navigate = useNavigate();

  // params & entity
  const params = useParams<{ entityId: string }>();
  const entity =
    entities?.find((entity) => entity.id === params.entityId) ?? null;

  // commonModal
  const { openModal } = useCommonModal();

  // subsets
  const subsetRows = useMemo(() => {
    if (!entity) {
      return [];
    }
    const { subsets } = entity;
    const subsetKeys = Object.keys(subsets);

    const uniqFields = uniq(
      subsetKeys.map((subsetKey) => subsets[subsetKey]).flat()
    );
    return uniqFields.map((field) => {
      return subsetKeys.reduce(
        (result, subsetKey) => {
          result.has[subsetKey] = subsets[subsetKey].includes(field);
          return result;
        },
        {
          field,
          has: {},
        } as {
          field: string;
          has: {
            [subsetKey: string]: boolean;
          };
        }
      );
    });
  }, [entity]);
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

  // cursor
  type Cursor = {
    sheet: "props" | "indexes" | "subsets" | `enumLabels-${string}`;
    y: number;
    x: number;
  };
  const [cursor, setCursor] = useState<Cursor>({
    sheet: "props",
    y: 0,
    x: 0,
  });
  const [focusedCursor, setFocusedCursor] = useState<string | null>(null);

  // entityId
  useEffect(() => {
    console.log(`entityId changed ${params.entityId}`);
    setCursor({
      sheet: "props",
      y: 0,
      x: 0,
    });
  }, [params.entityId]);

  const openPropForm = (mode: "add" | "modify", at?: number) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.props[at!];

    openModal(<EntityPropForm oldOne={oldOne} />, {
      onControlledOpen: () => {
        // keySwitch off
        keySwitchRef.current = false;

        // focus
        const focusInput = document.querySelector(
          `.entity-prop-form ${
            mode === "add" ? ".type-dropdown" : ".desc-input"
          } input`
        );
        if (focusInput) {
          (focusInput as HTMLInputElement).focus();
        }
      },
      onControlledClose: () => {
        // keySwitch on
        keySwitchRef.current = true;
      },
      onCompleted: (data: unknown) => {
        const newProps = (() => {
          const newProps = [...entity.props];
          if (mode === "add") {
            at ??= newProps.length - 1;
            newProps.splice(at + 1, 0, data as EntityProp);
            return newProps;
          } else {
            return newProps.map((prop, index) =>
              index === at ? (data as EntityProp) : prop
            );
          }
        })();

        SonamuUIService.modifyProps(entity.id, newProps)
          .then(({ updated }) => {
            entity.props = updated;
            mutate();
            setTimeout(() => {
              setCursor({
                ...cursor,
                sheet: "props",
                y: at! + 1,
              });
            }, 100);
          })
          .catch(defaultCatch);
      },
    });
  };
  const confirmDelProp = (at: number) => {
    if (!entity) {
      return;
    }
    const answer = confirm(
      `Are you sure to delete "${entity.props[at].name}"?`
    );
    if (!answer) {
      return;
    }

    const newProps = entity.props.filter((_p, index) => index !== at);
    SonamuUIService.modifyProps(entity.id, newProps)
      .then(({ updated }) => {
        entity.props = updated;
        mutate();
        setTimeout(() => {
          setCursor({
            ...cursor,
            sheet: "props",
            y: Math.min(at, entity.props.length - 1),
          });
        });
      })
      .catch(defaultCatch);
  };

  const openIndexForm = (mode: "add" | "modify", at?: number) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.indexes[at!];

    openModal(<EntityIndexForm entityId={entity.id} oldOne={oldOne} />, {
      onControlledOpen: () => {
        // keySwitch off
        keySwitchRef.current = false;

        // focus
        const focusInput = document.querySelector(
          `.entity-index-form .type-dropdown input`
        );
        console.log(focusInput);
        if (focusInput) {
          (focusInput as HTMLInputElement).focus();
        }
      },
      onControlledClose: () => {
        // keySwitch on
        keySwitchRef.current = true;
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

  const addEnumLabelRow = (enumId: string, cursorY?: number) => {
    if (!entity) {
      return;
    }

    cursorY ??= Object.keys(entity.enumLabels[enumId]).length - 1;
    entity.enumLabels[enumId] = {
      ...entity.enumLabels[enumId],
      "": "",
    };
    setCursor({
      sheet: `enumLabels-${enumId}`,
      y: cursorY + 1,
      x: 0,
    });
    setFocusedCursor(`enumLabels-${enumId}/${cursorY + 1}/0`);
  };

  // key
  const moveCursorToDown = (amount: number) => {
    if (!entity) {
      return;
    }

    setCursor((cursor) => {
      return {
        ...cursor,
        y: (() => {
          if (cursor.sheet === "props") {
            return Math.min(entity.props.length - 1, cursor.y + amount);
          } else if (cursor.sheet === "indexes") {
            return Math.min(entity.indexes.length - 1, cursor.y + amount);
          } else if (cursor.sheet.startsWith("enumLabels-")) {
            const [, enumId] = /^enumLabels-(.+)$/.exec(cursor.sheet) ?? [];
            if (!enumId) {
              return 0;
            }
            return Math.min(
              Object.keys(entity.enumLabels[enumId]).length - 1,
              cursor.y + amount
            );
          }
          return 0;
        })(),
      };
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  const moveCursorToUp = (amount: number) => {
    setCursor((cursor) => {
      return {
        ...cursor,
        y: Math.max(0, cursor.y - amount),
      };
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  const moveCursorToLeft = (amount: number) => {
    setCursor((cursor) => {
      return {
        ...cursor,
        x: Math.max(0, cursor.x - amount),
      };
    });
  };
  const moveCursorToRight = (amount: number) => {
    if (!entity) {
      return;
    }

    setCursor((cursor) => {
      return {
        ...cursor,
        x: (() => {
          if (cursor.sheet === "props") {
            return Math.min(7 - 1, cursor.y + amount);
          } else if (cursor.sheet === "indexes") {
            return Math.min(2 - 1, cursor.y + amount);
          } else if (cursor.sheet.startsWith("enumLabels-")) {
            const [, enumId] = /^enumLabels-(.+)$/.exec(cursor.sheet) ?? [];
            if (!enumId) {
              return 0;
            }
            return Math.min(2 - 1, cursor.x + amount);
          }
          return 0;
        })(),
      };
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  // 키 타이머 (1초 이내 입력인 경우 keyword를 누적하고 아닌 경우 초기화 후 입력)
  const keyTimerRef = useRef<{ keyword: string; timestamp: number } | null>();
  const keySwitchRef = useRef<boolean>(true);
  useEffect(() => {
    // keydown
    const onKeydown = (e: KeyboardEvent) => {
      if (!entity) {
        return;
      }
      if (!keySwitchRef.current) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          moveCursorToDown(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "ArrowUp":
          moveCursorToUp(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "ArrowLeft":
          moveCursorToLeft(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "ArrowRight":
          moveCursorToRight(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "PageDown":
          moveCursorToDown(10);
          e.preventDefault();
          return;
        case "PageUp":
          moveCursorToUp(10);
          e.preventDefault();
          return;
        case "Home":
          moveCursorToLeft(Infinity);
          e.preventDefault();
          return;
        case "End":
          moveCursorToRight(Infinity);
          e.preventDefault();
          return;
        case "n":
        case "N":
          if (e.ctrlKey && e.metaKey && e.shiftKey) {
            if (cursor.sheet === "props") {
              openPropForm("add", cursor.y);
            } else if (cursor.sheet === "indexes") {
              openIndexForm("add", cursor.y);
            } else if (cursor.sheet.includes("enumLabels")) {
              addEnumLabelRow(cursor.sheet.split("-")[1], cursor.y);
            }
            return;
          }
          break;
        case "Enter":
          if (cursor.sheet === "props") {
            openPropForm("modify", cursor.y);
          } else if (cursor.sheet === "indexes") {
            openIndexForm("modify", cursor.y);
          } else if (cursor.sheet.startsWith("enumLabels-")) {
            setFocusedCursor(`${cursor.sheet}/${cursor.y}/${cursor.x}`);
          }
          return;
        case "Backspace":
          if (e.metaKey) {
            if (cursor.sheet === "props") {
              confirmDelProp(cursor.y);
            } else if (cursor.sheet === "indexes") {
              confirmDelIndex(cursor.y);
            } else if (cursor.sheet.startsWith("enumLabels")) {
              const [, enumId] = /^enumLabels-(.+)$/.exec(cursor.sheet) ?? [];
              if (!enumId) {
                return;
              }
              const enumLabels = entity.enumLabels[enumId];
              const keys = Object.keys(enumLabels);
              const key = keys[cursor.y];
              if (key) {
                delete enumLabels[key];
                SonamuUIService.modifyEnumLabels(entity.id, entity.enumLabels)
                  .then(({ updated }) => {
                    entity.enumLabels = updated;
                    mutate();
                  })
                  .catch(defaultCatch);
              }
            }
          }
          e.preventDefault();
          return;
        case "p":
        case "P":
          if (e.ctrlKey && e.shiftKey && e.metaKey) {
            const entityId = prompt("어디로 갈래?");
            if (!entityId) {
              return;
            }
            const isExists =
              entities?.some((entity) => entity.id === entityId) ?? false;
            if (!isExists) {
              alert(`존재하지 않는 Entity ${entityId}`);
              return;
            }
            navigate(`/entities/${entityId}`);
          }
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        const THRESHOLD = 300; // 연속 키입력 0.3초
        const nowTimestamp = Date.now();
        const prevTimestamp = keyTimerRef.current?.timestamp ?? nowTimestamp;
        const diff = nowTimestamp - prevTimestamp;
        keyTimerRef.current = {
          timestamp: nowTimestamp,
          keyword:
            diff < THRESHOLD
              ? (keyTimerRef.current?.keyword ?? "") + e.key
              : e.key,
        };
        const keyword = keyTimerRef.current?.keyword ?? e.key;

        if (cursor.sheet === "props") {
          const targetProp = entity.props.find((p) =>
            p.name.startsWith(keyword)
          );
          if (!targetProp) {
            return;
          }
          const targetIndex = entity.props.indexOf(targetProp);
          setCursor({
            ...cursor,
            sheet: "props",
            y: targetIndex,
          });
        } else if (cursor.sheet === "subsets") {
          const targetSubset = subsetRows.find((subsetRow) =>
            subsetRow.field.startsWith(keyword)
          );
          if (!targetSubset) {
            return;
          }
          const targetIndex = subsetRows.indexOf(targetSubset);
          setCursor({
            ...cursor,
            sheet: "subsets",
            y: targetIndex,
          });
        }
        return;
      }
      console.log(`${e.key} pressed`);
    };

    // outside click
    const onMousedown = (e: MouseEvent) => {
      if (focusedCursor === null) {
        return;
      } else if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      setFocusedCursor(null);
    };

    document.addEventListener("keydown", onKeydown);
    document.addEventListener("mousedown", onMousedown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("mousedown", onMousedown);
    };
  }, [entity, cursor, focusedCursor]);

  return (
    <div className="entities-detail">
      {isLoading && <div>Loading</div>}
      {entity && (
        <>
          <div className="props-and-indexes">
            <div className="props">
              <h3>Props</h3>
              <Table celled>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Name</Table.HeaderCell>
                    <Table.HeaderCell>Desc</Table.HeaderCell>
                    <Table.HeaderCell>Type</Table.HeaderCell>
                    <Table.HeaderCell>Nullable</Table.HeaderCell>
                    <Table.HeaderCell>With</Table.HeaderCell>
                    <Table.HeaderCell>Default</Table.HeaderCell>
                    <Table.HeaderCell>Filter</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {entity.props.map((prop, propIndex) => (
                    <Table.Row
                      key={propIndex}
                      className={classNames({
                        "cursor-row-pointed":
                          cursor.sheet === "props" && cursor.y === propIndex,
                      })}
                      onClick={() =>
                        setCursor({ ...cursor, sheet: "props", y: propIndex })
                      }
                    >
                      <Table.Cell>{prop.name}</Table.Cell>
                      <Table.Cell>{prop.desc}</Table.Cell>
                      <Table.Cell collapsing>
                        {prop.type}{" "}
                        {(prop.type === "string" || prop.type === "enum") && (
                          <>({prop.length}) </>
                        )}
                      </Table.Cell>
                      <Table.Cell collapsing>
                        {prop.nullable && <Label>NULL</Label>}
                      </Table.Cell>
                      <Table.Cell collapsing>
                        {prop.type === "enum" && (
                          <>
                            <Label color="olive">{prop.id}</Label>
                          </>
                        )}
                        {prop.type === "relation" && (
                          <>
                            <Label color="orange">
                              {prop.relationType}: {prop.with}
                            </Label>
                          </>
                        )}
                      </Table.Cell>

                      <Table.Cell collapsing>
                        {prop.type !== "relation" && <>{prop.dbDefault}</>}
                      </Table.Cell>
                      <Table.Cell collapsing>{prop.toFilter && "O"}</Table.Cell>
                    </Table.Row>
                  ))}
                  <Table.Row>
                    <Table.Cell colSpan={7} className="footer-buttons">
                      <Button
                        color="blue"
                        content="Add a prop"
                        icon="plus"
                        size="mini"
                        onClick={() => openPropForm("add")}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table>
            </div>
            <div className="indexes">
              <h3>Indexes</h3>
              <Table celled>
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
                      className={classNames({
                        "cursor-row-pointed":
                          cursor.sheet === "indexes" && cursor.y === indexIndex,
                      })}
                      onClick={() =>
                        setCursor({
                          ...cursor,
                          sheet: "indexes",
                          y: indexIndex,
                        })
                      }
                    >
                      <Table.Cell collapsing>
                        <strong>{index.type}</strong>
                      </Table.Cell>
                      <Table.Cell>
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
                        onClick={() => openIndexForm("add")}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table>
            </div>
          </div>
          {entity && Object.keys(entity.enumLabels).length > 0 && (
            <div className="enums">
              <h3>Enums</h3>
              <div className="enums-list">
                {Object.keys(entity.enumLabels).map((enumId, enumsIndex) => (
                  <div className="enums-table" key={enumsIndex}>
                    <Table celled>
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell colSpan={2}>
                            {enumId}
                          </Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {Object.entries(entity.enumLabels[enumId]).map(
                          ([key, value], enumLabelIndex) => (
                            <Table.Row
                              key={enumLabelIndex}
                              className={classNames({
                                "cursor-row-pointed":
                                  cursor.sheet === `enumLabels-${enumId}` &&
                                  cursor.y === enumLabelIndex,
                              })}
                            >
                              <Table.Cell
                                collapsing
                                className={classNames({
                                  "cursor-cell-pointed":
                                    cursor.sheet === `enumLabels-${enumId}` &&
                                    cursor.y === enumLabelIndex &&
                                    cursor.x === 0,
                                })}
                                onClick={() =>
                                  setCursor({
                                    ...cursor,
                                    sheet: `enumLabels-${enumId}`,
                                    y: enumLabelIndex,
                                    x: 0,
                                  })
                                }
                                onDoubleClick={() =>
                                  setFocusedCursor(
                                    `enumLabels-${enumId}/${enumLabelIndex}/0`
                                  )
                                }
                              >
                                <EditableInput
                                  editable={
                                    focusedCursor ===
                                    `enumLabels-${enumId}/${enumLabelIndex}/0`
                                  }
                                  initialValue={key}
                                  onChange={(value) => {
                                    setFocusedCursor(null);
                                    if (value !== key) {
                                      // 키 변경
                                      const newEnumLabels = {
                                        ...entity.enumLabels,
                                        [enumId]: {
                                          ...entity.enumLabels[enumId],
                                          [value]: "",
                                        },
                                      };
                                      delete newEnumLabels[enumId][key];
                                      entity.enumLabels = newEnumLabels;

                                      setCursor({
                                        sheet: `enumLabels-${enumId}`,
                                        y: enumLabelIndex,
                                        x: 1,
                                      });
                                      setFocusedCursor(
                                        `enumLabels-${enumId}/${enumLabelIndex}/1`
                                      );
                                    }
                                  }}
                                />
                              </Table.Cell>
                              <Table.Cell
                                className={classNames({
                                  "cursor-cell-pointed":
                                    cursor.sheet === `enumLabels-${enumId}` &&
                                    cursor.y === enumLabelIndex &&
                                    cursor.x === 1,
                                })}
                                onClick={() =>
                                  setCursor({
                                    ...cursor,
                                    sheet: `enumLabels-${enumId}`,
                                    y: enumLabelIndex,
                                    x: 1,
                                  })
                                }
                                onDoubleClick={() =>
                                  setFocusedCursor(
                                    `enumLabels-${enumId}/${enumLabelIndex}/1`
                                  )
                                }
                              >
                                <EditableInput
                                  editable={
                                    focusedCursor ===
                                    `enumLabels-${enumId}/${enumLabelIndex}/1`
                                  }
                                  initialValue={value}
                                  onChange={(newValue) => {
                                    setFocusedCursor(null);
                                    if (newValue !== value) {
                                      // 값 변경
                                      entity.enumLabels[enumId][key] = newValue;

                                      SonamuUIService.modifyEnumLabels(
                                        entity.id,
                                        entity.enumLabels
                                      )
                                        .then(({ updated }) => {
                                          entity.enumLabels = updated;
                                          mutate();
                                        })
                                        .catch(defaultCatch);
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
              {entity && subsetRows && (
                <Table celled>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Field</Table.HeaderCell>
                      {Object.keys(entity.subsets).map((subsetKey) => (
                        <Table.HeaderCell key={subsetKey}>
                          {subsetKey}{" "}
                          {subsetKey !== "A" && (
                            <Button
                              icon="trash"
                              size="mini"
                              onClick={() => delSubset(subsetKey)}
                            />
                          )}
                        </Table.HeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {subsetRows.map((subsetRow, subsetRowIndex) => (
                      <Table.Row
                        key={subsetRowIndex}
                        className={classNames({
                          "cursor-row-pointed":
                            cursor.sheet === "subsets" &&
                            cursor.y === subsetRowIndex,
                        })}
                        onClick={() =>
                          setCursor({
                            ...cursor,
                            sheet: "subsets",
                            y: subsetRowIndex,
                          })
                        }
                      >
                        <Table.Cell>{subsetRow.field}</Table.Cell>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <Table.Cell key={subsetKey}>
                            <Checkbox
                              checked={subsetRow.has[subsetKey]}
                              onChange={(_e, data) => {
                                if (data.checked === false) {
                                  // 서브셋의 필드 삭제
                                  omitFieldOnSubset(subsetKey, subsetRow.field);
                                } else if (data.checked === true) {
                                  // 서브셋에 필드 추가
                                  appendFieldOnSubset(
                                    subsetKey,
                                    subsetRow.field
                                  );
                                }
                              }}
                            />
                          </Table.Cell>
                        ))}
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
