import { useEffect, useMemo, useState } from "react";
import { Table } from "semantic-ui-react";
import AICreateForm, {
  EnumJson,
  useAICreateForm,
} from "../../components/AICreateForm";
import { useCommonModal } from "../../components/core/CommonModal";
import { useSheetTable } from "../../components/useSheetTable";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { defaultCatch } from "../../services/sonamu.shared";
import { Entity } from "sonamu";

type AICreateEnumFormProps = {
  entityId: string;
  enumLables: Entity["enumLabels"];
};
export function AICreateEnumForm({
  entityId,
  enumLables,
}: AICreateEnumFormProps) {
  // useCommonModal
  const { doneModal } = useCommonModal();
  const { response, loading } = useAICreateForm<EnumJson>({
    type: "enum",
  });
  const [newEnum, setNewEnum] = useState<EnumJson | null>(null);

  // useSheetTable
  const { regRow, regCell } = useSheetTable({
    sheets: [
      ...Object.keys(newEnum ?? {}).map((enumId) => ({
        name: `enumLabels-${enumId}`,
      })),
    ],
    onExecute: undefined,
    onKeywordChanged: undefined,
    onKeydown: () => true,
    disable: true,
  });

  const writeEnum = () => {
    if (!newEnum) {
      alert("Enum 정보가 누락되었습니다.");
      return;
    }

    Object.keys(newEnum).forEach((enumId) => {
      enumLables[enumId] = newEnum[enumId];
    });

    SonamuUIService.modifyEnumLabels(entityId, enumLables)
      .then(() => {
        doneModal();
      })
      .catch(defaultCatch);
  };

  useEffect(() => {
    if (response) {
      setNewEnum(response);
    } else {
      setNewEnum(null);
    }
  }, [response]);

  const enumLabelsArray: {
    [enumId: string]: { key: string; label: string }[];
  } = useMemo(() => {
    if (!newEnum) return {};
    return Object.fromEntries(
      Object.entries(newEnum).map(([enumId, enumLabels]) => [
        enumId,
        Object.entries(enumLabels as Record<string, string>).map(
          ([key, label]) => ({
            key,
            label,
          })
        ),
      ])
    );
  }, [newEnum]);

  return (
    <AICreateForm write={writeEnum}>
      <div className="entities-detail">
        {newEnum && (
          <div className="enums-and-subsets">
            {newEnum && Object.keys(enumLabelsArray).length > 0 && (
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
          </div>
        )}
      </div>
    </AICreateForm>
  );
}
