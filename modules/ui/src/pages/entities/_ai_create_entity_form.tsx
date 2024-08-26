import { useEffect, useMemo, useState } from "react";
import { Icon, Label, LabelDetail, List, Table } from "semantic-ui-react";
import AICreateForm, { useAICreateForm } from "../../components/AICreateForm";
import { useCommonModal } from "../../components/core/CommonModal";
import { defaultCatch } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { EntityJson } from "sonamu";
import { useSheetTable } from "../../components/useSheetTable";
import { uniq } from "lodash";

type AICreateEntityFormProps = {};
export function AICreateEntityForm({}: AICreateEntityFormProps) {
  // useCommonModal
  const { doneModal } = useCommonModal();
  const { loading, response } = useAICreateForm<EntityJson>({
    type: "entity",
  });
  const [entity, setEntity] = useState<EntityJson | null>(null);

  // useSheetTable
  const { regRow, regCell, isFocused } = useSheetTable({
    sheets: [
      {
        name: "props",
      },
      {
        name: "indexes",
      },
      ...Object.keys(entity?.enums ?? {}).map((enumId) => ({
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
    onExecute: undefined,
    onKeywordChanged: undefined,
    onKeydown: () => true,
    disable: true,
  });

  const writeEntity = () => {
    if (!entity) {
      alert("엔티티 정보가 누락되었습니다.");
      return;
    }
    if (!entity.props.find((p) => p.name === "id")) {
      alert("ID가 누락되었습니다.");
      return;
    }
    if (!entity.table) {
      alert("테이블명이 누락되었습니다.");
      return;
    }

    SonamuUIService.createEntity(entity)
      .then(() => {
        doneModal(entity.id);
      })
      .catch(defaultCatch);
  };

  // subsets
  const enumLabelsArray: {
    [enumId: string]: { key: string; label: string }[];
  } = useMemo(() => {
    if (!entity) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(entity.enums).map(([enumId, enumLabels]) => [
        enumId,
        Object.entries(enumLabels).map(([key, label]) => ({
          key,
          label,
        })),
      ])
    );
  }, [entity]);

  const flattenSubsetRows = useMemo(() => {
    if (!entity) {
      return [];
    }

    const subsets = uniq(Object.values(entity.subsets).flat());
    const splitField = subsets.map((subset) => subset.split("."));

    // splitField의 각 아이템에 대해 배열 길이순 정렬(길이가 같을 경우 각 아이템의 마지막 요소를 제외하고 요소별 알파벳순 정렬)
    const sortedSplitField = splitField.sort((a, b) => {
      if (a.length === b.length && a.length > 1) {
        return a.slice(0, -1).join("").localeCompare(b.slice(0, -1).join(""));
      }
      return a.length - b.length;
    });

    return sortedSplitField;
  }, [entity]);

  useEffect(() => {
    if (response) {
      const keys = Object.keys(response);
      ["id", "title", "table", "props", "indexes", "enums", "subsets"].forEach(
        (key) => {
          if (!keys.includes(key)) {
            throw new Error(`Entity JSON is missing key: ${key}`);
          }
        }
      );

      setEntity(response);
    } else {
      setEntity(null);
    }
  }, [response]);

  return (
    <AICreateForm write={writeEntity}>
      <div className="entities-detail">
        {entity && (
          <>
            <div className="entity-base">
              <h3>{entity.id}</h3>
              <List horizontal>
                <List.Item>
                  <Label>
                    Title
                    <LabelDetail>{entity.title}</LabelDetail>
                  </Label>
                </List.Item>
                <List.Item>
                  <Label>
                    Table
                    <LabelDetail>{entity.table}</LabelDetail>
                  </Label>
                </List.Item>
                <List.Item>
                  <Label>
                    Parent ID
                    <LabelDetail>{entity.parentId ?? "Ｘ"}</LabelDetail>
                  </Label>
                </List.Item>
              </List>
            </div>
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
                      {...regRow("props", propIndex)}
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
                </Table.Body>
              </Table>
            </div>
            {entity && Object.keys(enumLabelsArray).length > 0 && (
              <div className="enums">
                <h3>Enums</h3>
                <div className="enums-list">
                  {Object.keys(enumLabelsArray).map((enumId, enumsIndex) => (
                    <div className="enums-table" key={enumsIndex}>
                      <Table celled selectable id={`enum-${enumId}`} collapsing>
                        <Table.Header>
                          <Table.Row>
                            <Table.HeaderCell colSpan={2}>
                              {enumId}
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
                                  {key}
                                </Table.Cell>
                                <Table.Cell
                                  {...regCell(
                                    `enumLabels-${enumId}`,
                                    enumLabelIndex,
                                    1
                                  )}
                                >
                                  {label}
                                </Table.Cell>
                              </Table.Row>
                            )
                          )}
                        </Table.Body>
                      </Table>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {entity && Object.keys(entity.subsets).length > 0 && (
              <div className="subsets">
                <h3>Subsets</h3>
                {entity && flattenSubsetRows.length > 0 && (
                  <Table celled selectable>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Field</Table.HeaderCell>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <Table.HeaderCell key={subsetKey} collapsing>
                            Subset{subsetKey}
                          </Table.HeaderCell>
                        ))}
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {flattenSubsetRows.map((subsetRow, subsetRowIndex) => (
                        <Table.Row
                          id={subsetRow.join(".")}
                          key={subsetRowIndex}
                          {...regRow("subsets", subsetRowIndex)}
                        >
                          <Table.Cell
                            {...regCell("subsets", subsetRowIndex, 0)}
                          >
                            <span style={{ color: "silver" }}>
                              {subsetRow.slice(0, -1).join(" > ")}
                              {subsetRow.slice(0, -1).length > 0 && " > "}
                            </span>
                            {subsetRow.slice(-1)}
                          </Table.Cell>
                          {Object.keys(entity.subsets).map((subsetKey) => (
                            <Table.Cell key={subsetKey}>
                              {entity.subsets[subsetKey].includes(
                                subsetRow.join(".")
                              ) && <Icon name="check" />}
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
    </AICreateForm>
  );
}
