import { useNavigate, useParams } from "react-router-dom";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { Button, Checkbox, Label, Table } from "semantic-ui-react";
import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { uniq } from "lodash";
import { defaultCatch } from "../../services/sonamu.shared";
import { EntityProp } from "sonamu";
import { useCommonModal } from "../../components/core/CommonModal";
import { EntityPropForm } from "./_prop_form";

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
  const [cursor, setCursor] = useState<{
    which: "props" | "indexes" | "subsets";
    index: number;
  }>({
    which: "props",
    index: 0,
  });

  // entityId
  useEffect(() => {
    console.log(`entityId changed ${params.entityId}`);
    setCursor({
      which: "props",
      index: 0,
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
                which: "props",
                index: at! + 1,
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
            which: "props",
            index: Math.min(at, entity.props.length - 1),
          });
        });
      })
      .catch(defaultCatch);
  };

  // key
  const moveCursorToNext = (amount: number) => {
    if (!entity) {
      return;
    }
    setCursor((cursor) => {
      return {
        ...cursor,
        index: Math.min(entity.props.length - 1, cursor.index + amount),
      };
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  const moveCursorToPrev = (amount: number) => {
    setCursor((cursor) => {
      return {
        ...cursor,
        index: Math.max(0, cursor.index - amount),
      };
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  // 키 타이머 (1초 이내 입력인 경우 keyword를 누적하고 아닌 경우 초기화 후 입력)
  const keyTimerRef = useRef<{ keyword: string; timestamp: number } | null>();
  const keySwitchRef = useRef<boolean>(true);
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (!entity) {
        return;
      }
      if (!keySwitchRef.current) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          moveCursorToNext(1);
          e.preventDefault();
          return;
        case "ArrowUp":
          moveCursorToPrev(1);
          e.preventDefault();
          return;
        case "PageDown":
          moveCursorToNext(10);
          e.preventDefault();
          return;
        case "PageUp":
          moveCursorToPrev(10);
          e.preventDefault();
          return;
        case "Home":
          moveCursorToPrev(Infinity);
          return;
        case "End":
          moveCursorToNext(Infinity);
          return;
        case "n":
        case "N":
          if (e.ctrlKey && e.metaKey && e.shiftKey) {
            if (cursor.which === "props") {
              openPropForm("add", cursor.index);
            }
            return;
          }
          break;
        case "Enter":
          if (cursor.which === "props") {
            openPropForm("modify", cursor.index);
          }
          return;
        case "Backspace":
          if (e.metaKey) {
            if (cursor.which === "props") {
              confirmDelProp(cursor.index);
            }
          }
          e.preventDefault();
          return;
        case "p":
        case "P":
          if (e.ctrlKey && e.metaKey) {
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

        if (cursor.which === "props") {
          const targetProp = entity.props.find((p) =>
            p.name.startsWith(keyword)
          );
          if (!targetProp) {
            return;
          }
          const targetIndex = entity.props.indexOf(targetProp);
          setCursor({
            which: "props",
            index: targetIndex,
          });
        } else if (cursor.which === "subsets") {
          const targetSubset = subsetRows.find((subsetRow) =>
            subsetRow.field.startsWith(keyword)
          );
          if (!targetSubset) {
            return;
          }
          const targetIndex = subsetRows.indexOf(targetSubset);
          setCursor({
            which: "subsets",
            index: targetIndex,
          });
        }
        return;
      }
      console.log(`${e.key} pressed`);
    };

    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
    };
  }, [cursor]);

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
                        "cursor-pointed":
                          cursor.which === "props" &&
                          cursor.index === propIndex,
                      })}
                      onClick={() =>
                        setCursor({ which: "props", index: propIndex })
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
                        "cursor-pointed":
                          cursor.which === "indexes" &&
                          cursor.index === indexIndex,
                      })}
                      onClick={() =>
                        setCursor({ which: "indexes", index: indexIndex })
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
                </Table.Body>
              </Table>
            </div>
          </div>
          {/* <div className="enums">
            <h3>Enums</h3>
          </div> */}
          {entity && Object.keys(entity.subsets).length > 0 && (
            <div className="subsets">
              <h3>Subsets</h3>
              {entity && subsetRows && (
                <Table celled>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Field</Table.HeaderCell>
                      {Object.keys(entity.subsets).map((subsetKey) => (
                        <Table.HeaderCell key={subsetKey}>
                          {subsetKey}
                        </Table.HeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {subsetRows.map((subsetRow, subsetRowIndex) => (
                      <Table.Row
                        key={subsetRowIndex}
                        className={classNames({
                          "cursor-pointed":
                            cursor.which === "subsets" &&
                            cursor.index === subsetRowIndex,
                        })}
                        onClick={() =>
                          setCursor({ which: "subsets", index: subsetRowIndex })
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
