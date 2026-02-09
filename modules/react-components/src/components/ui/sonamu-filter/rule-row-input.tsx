import TrashIcon from "~icons/lucide/trash-2";
import type { FilterOperator } from "../../../lib/types";
import { operatorsByPropType } from "../../../lib/types";
import { Button, Input, Select } from "../..";
import { operatorLabels } from "./constants";
import type { RuleRowProps } from "./types";
import { ValueInput } from "./value-input";

/**
 * Rule Row Input 컴포넌트
 */
export function RuleRowInput({ rule, fieldMeta, onUpdate, onRemove }: RuleRowProps) {
  const fields = Object.keys(fieldMeta);
  const selectedFieldMeta = rule.field ? fieldMeta[rule.field] : null;
  const allowedOperators = selectedFieldMeta ? operatorsByPropType[selectedFieldMeta.propType] : [];

  const handleFieldChange = (newField: string | null | undefined) => {
    // Field 변경 시 operator/value 초기화
    onUpdate({
      field: newField ?? null,
      operator: null,
      value: undefined,
    });
  };

  const handleOperatorChange = (newOperator: string | null | undefined) => {
    // operator 변경 시 value도 초기화
    onUpdate({
      operator: (newOperator as FilterOperator) ?? null,
      value: undefined,
    });
  };

  return (
    <div className="flex items-start gap-2 p-3 border rounded-lg bg-gray-50">
      {/* Field Select */}
      <div className="flex-1 min-w-[150px]">
        <Select
          items={fields}
          value={rule.field ?? ""}
          onValueChange={handleFieldChange}
          placeholder="Select field..."
        />
      </div>

      {/* Operator Select */}
      <div className="flex-1 min-w-[120px]">
        <Select
          items={allowedOperators.map((op) => ({
            value: op,
            label: operatorLabels[op],
          }))}
          value={rule.operator ?? undefined}
          onValueChange={handleOperatorChange}
          disabled={!rule.field}
          placeholder="Operator..."
        />
      </div>

      {/* Value Input */}
      <div className="flex-1 min-w-[150px]">
        {rule.operator && selectedFieldMeta ? (
          <ValueInput
            propType={selectedFieldMeta.propType}
            operator={rule.operator}
            value={rule.value}
            onChange={(newValue) => onUpdate({ value: newValue })}
            fieldMeta={selectedFieldMeta}
          />
        ) : (
          <Input type="text" disabled placeholder="Select operator first..." />
        )}
      </div>

      {/* Remove Button */}
      <Button variant="ghost" size="sm" onClick={onRemove} className="shrink-0 h-10 px-3">
        <TrashIcon />
      </Button>
    </div>
  );
}
