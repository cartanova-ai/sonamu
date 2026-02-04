/** biome-ignore-all lint/suspicious/noExplicitAny: Zod 타입 접근 */
/** biome-ignore-all lint/performance/noDynamicNamespaceImportAccess: Convention-based enum label 자동 감지를 위해 필요 */
import {
  Button,
  DateInput,
  DatePicker,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EnumSelect,
  Input,
  SelectNew,
} from "@sonamu-kit/react-components/components";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { RangeNumberInput } from "@/components/common/RangeNumberInput";
import { TagInput } from "@/components/common/TagInput";
import * as SonamuGenerated from "@/services/sonamu.generated";
import type { FilterOperator, FilterPropType } from "@/services/sonamu.shared";
import { operatorsByPropType } from "@/services/sonamu.shared";
import PlusIcon from "~icons/lucide/plus";
import TrashIcon from "~icons/lucide/trash-2";

// ================================================
// Type Definitions
// ================================================

type FieldMeta = {
  propType: FilterPropType;
  nullable: boolean;
  enumData?: {
    options: string[];
    labels: Record<string, string>;
  };
};

/**
 * Rule 타입 정의
 */
type Rule = {
  id: string;
  field: string | null;
  operator: FilterOperator | null;
  value: unknown;
};

/**
 * Operator UI 라벨
 */
const operatorLabels: Record<FilterOperator, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  startsWith: "starts with",
  endsWith: "ends with",
  in: "in",
  notIn: "not in",
  between: "between",
  before: "before",
  after: "after",
  isNull: "NULL",
  isNotNull: "NOTNULL",
};

/**
 * Zod 타입 이름 정의
 */
const zodTypeToFilterPropTypeMap: Record<string, FilterPropType> = {
  string: "string",
  number: "integer",
  boolean: "boolean",
  date: "datetime",
  enum: "enum",
  array: "json",
  object: "json",
};

/**
 * Zod 내부 API 접근을 위한 타입 정의
 */
type ZodDef = {
  type: string;
  innerType?: z.ZodTypeAny;
  meta?: Record<string, unknown>;
};

type ZodWithDef = z.ZodTypeAny & {
  _def: ZodDef;
};

// ================================================
// Functions
// ================================================

/**
 * ZodNullable, ZodOptional 등의 래퍼를 벗겨내고 내부 타입을 반환
 * nullable/optional 여부도 함께 반환
 */
function unwrapZodType(zodType: z.ZodTypeAny): {
  innerType: z.ZodTypeAny;
  nullable: boolean;
} {
  let current = zodType as ZodWithDef;
  let nullable = false;

  while (current._def.type === "nullable" || current._def.type === "optional") {
    if (current._def.type === "nullable") {
      nullable = true;
    }
    current = current._def.innerType as ZodWithDef;
  }

  return { innerType: current, nullable };
}

/**
 * Zod 타입 이름을 FilterPropType으로 변환
 */
function zodTypeNameToPropType(typeName: string): FilterPropType {
  return zodTypeToFilterPropTypeMap[typeName] ?? "string";
}

/**
 * Zod enum에서 options와 labels를 추출
 * Convention: {EnumName}Label 형태의 객체를 SonamuGenerated에서 찾음
 */
function extractEnumData(zodEnum: z.ZodTypeAny): FieldMeta["enumData"] {
  // options 추출
  const options = (zodEnum as any).options
    ? (Array.from((zodEnum as any).options) as string[])
    : undefined;

  if (!options) {
    return undefined;
  }

  // labels 추출 (Convention-based: {EnumName}Label)
  const enumDescription = (zodEnum as any)._def?.description || (zodEnum as any).description;
  let labels: Record<string, string> = {};

  if (enumDescription) {
    const labelKey = `${enumDescription}Label` as keyof typeof SonamuGenerated;
    const foundLabels = SonamuGenerated[labelKey];
    if (foundLabels && typeof foundLabels === "object") {
      labels = foundLabels as Record<string, string>;
    }
  }

  return { options, labels };
}

/**
 * Zod 스키마에서 각 필드의 타입 정보를 추출하여 FieldMeta 형태로 변환
 */
function extractFieldMetaFromSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, FieldMeta> {
  const shape = schema.shape;
  const fieldMeta: Record<string, FieldMeta> = {};

  for (const [fieldName, zodSchema] of Object.entries(shape)) {
    // virtual, textsearchable로 시작하는 필드는 제외
    if (fieldName.startsWith("virtual") || fieldName.startsWith("textsearchable")) {
      continue;
    }

    // nullable/optional 벗겨내기
    const { innerType, nullable } = unwrapZodType(zodSchema as z.ZodTypeAny);

    // 메타 SonamuPropType 체크 (numeric 등)
    const meta = (zodSchema as any).meta?.();
    const sonamuPropType = meta?.SonamuPropType;
    const isNumeric = sonamuPropType === "numeric";

    // propType 결정
    const innerWithDef = innerType as ZodWithDef;
    const propType: FilterPropType = isNumeric
      ? "numeric"
      : zodTypeNameToPropType(innerWithDef._def.type);

    // enum 타입인 경우 추가 정보 추출
    const enumData = propType === "enum" ? extractEnumData(innerType) : undefined;

    fieldMeta[fieldName] = {
      propType,
      nullable,
      enumData,
    };
  }

  return fieldMeta;
}

// ================================================
// Components
// ================================================

/**
 * ValueInput 컴포넌트
 * operator와 propType에 따라 적절한 입력 UI 렌더링
 * TODO: ValueInput 컴포넌트는 다음 커밋에서 동작 하나씩 확인하며 작업할 예정입니다.
 */
function ValueInput({
  propType,
  operator,
  value,
  onChange,
  fieldMeta,
}: {
  propType: FilterPropType;
  operator: FilterOperator;
  value: unknown;
  onChange: (value: unknown) => void;
  fieldMeta?: FieldMeta;
}) {
  // isNull/isNotNull: Boolean select (true/false)
  if (operator === "isNull" || operator === "isNotNull") {
    return (
      <SelectNew
        items={[
          { value: "true", label: "True" },
          { value: "false", label: "False" },
        ]}
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => v && onChange(v === "true")}
        placeholder="Select..."
        className="w-full"
      />
    );
  }

  // in/notIn: 다중 값 입력
  if (operator === "in" || operator === "notIn") {
    if (propType === "enum" && fieldMeta?.enumData) {
      return (
        <EnumSelect
          enum={{ options: fieldMeta.enumData.options }}
          labels={fieldMeta.enumData.labels}
          value={(value as string[]) ?? []}
          onValueChange={onChange}
          multiple={true}
        />
      );
    }
    // string/number: TagInput
    return (
      <TagInput
        value={(value as string[]) ?? []}
        onChange={onChange}
        type={propType === "integer" || propType === "numeric" ? "number" : "text"}
      />
    );
  }

  // between: 범위 입력
  if (operator === "between") {
    if (propType === "integer" || propType === "numeric") {
      return (
        <RangeNumberInput
          value={(value as [number, number]) ?? [undefined, undefined]}
          onChange={onChange}
        />
      );
    }
    if (propType === "date" || propType === "datetime") {
      // DateInput 2개로 범위 입력 (간단 버전)
      const [start, end] = (value as [Date, Date]) ?? [undefined, undefined];
      return (
        <div className="flex items-center gap-2">
          <DateInput
            value={start ?? null}
            onValueChange={(v) => onChange([v ?? undefined, end])}
            placeholder="시작일"
            className="flex-1"
          />
          <span className="text-muted-foreground">~</span>
          <DateInput
            value={end ?? null}
            onValueChange={(v) => onChange([start, v ?? undefined])}
            placeholder="종료일"
            className="flex-1"
          />
        </div>
      );
    }
  }

  // enum: EnumSelect (단일)
  if (propType === "enum" && fieldMeta?.enumData) {
    return (
      <EnumSelect
        enum={{ options: fieldMeta.enumData.options }}
        labels={fieldMeta.enumData.labels}
        value={(value as string) ?? ""}
        onValueChange={onChange}
      />
    );
  }

  // date/datetime: DatePicker
  if (propType === "date" || propType === "datetime") {
    return <DatePicker value={(value as Date) ?? undefined} onValueChange={onChange} />;
  }

  // string: text input
  if (propType === "string") {
    return (
      <Input
        type="text"
        value={(value as string) ?? ""}
        onValueChange={onChange}
        placeholder="Enter value..."
      />
    );
  }

  // integer/numeric: number input
  if (propType === "integer" || propType === "numeric") {
    return (
      <Input
        type="number"
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => onChange(v === "" ? undefined : Number(v))}
        placeholder="Enter number..."
      />
    );
  }

  // boolean: true/false select
  if (propType === "boolean") {
    return (
      <SelectNew
        items={[
          { value: "true", label: "True" },
          { value: "false", label: "False" },
        ]}
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => v && onChange(v === "true")}
        placeholder="Select..."
        className="w-full"
      />
    );
  }

  // json 타입은 isNull/isNotNull만 지원
  return <Input type="text" value="" placeholder="Not supported..." disabled />;
}

/**
 * Rule Row 컴포넌트
 */
function RuleRow({
  rule,
  fieldMeta,
  onUpdate,
  onRemove,
}: {
  rule: Rule;
  fieldMeta: Record<string, FieldMeta>;
  onUpdate: (updates: Partial<Rule>) => void;
  onRemove: () => void;
}) {
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
        <SelectNew
          items={fields}
          value={rule.field ?? ""}
          onValueChange={handleFieldChange}
          placeholder="Select field..."
        />
      </div>

      {/* Operator Select */}
      <div className="flex-1 min-w-[120px]">
        <SelectNew
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
        <TrashIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ================================================
// SonamuFilterModal
// ================================================

type SonamuFilterModalProps = {
  baseSchema: z.ZodObject<z.ZodRawShape>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply?: (filters: Record<string, unknown>) => void;
};

export function SonamuFilterModal({
  baseSchema,
  open,
  onOpenChange,
  onApply,
}: SonamuFilterModalProps) {
  // Apply된 최종 상태
  const [appliedRules, setAppliedRules] = useState<Rule[]>([]);
  // 작업 중 상태
  const [rules, setRules] = useState<Rule[]>([]);

  // 모달이 열릴 때마다 appliedRules를 rules로 복사
  useEffect(() => {
    if (open) {
      setRules(appliedRules.map((rule) => ({ ...rule })));
    }
  }, [open]);

  // baseSchema에서 동적으로 FieldMeta 추출
  const fieldMeta = extractFieldMetaFromSchema(baseSchema);

  // Rule 추가
  const addRule = () => {
    setRules([
      ...rules,
      {
        id: crypto.randomUUID(),
        field: null,
        operator: null,
        value: undefined,
      },
    ]);
  };

  // Rule 삭제
  const removeRule = (id: string) => {
    setRules(rules.filter((rule) => rule.id !== id));
  };

  // Rule 업데이트
  const updateRule = (id: string, updates: Partial<Rule>) => {
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  // FilterQuery로 변환
  const buildFilterQuery = (): Record<string, unknown> => {
    const filters: Record<string, unknown> = {};

    for (const rule of rules) {
      if (!rule.field || !rule.operator) continue;

      // isNull/isNotNull은 객체 형태로
      if (rule.operator === "isNull" || rule.operator === "isNotNull") {
        filters[rule.field] = { [rule.operator]: rule.value };
      } else {
        // 다른 연산자들
        filters[rule.field] = { [rule.operator]: rule.value };
      }
    }

    return filters;
  };

  // Apply 버튼 클릭
  const handleApply = () => {
    const filters = buildFilterQuery();
    // 현재 rules를 확정 상태로 저장
    setAppliedRules(rules.map((rule) => ({ ...rule })));
    onApply?.(filters);
    onOpenChange(false);
  };

  // Reset 버튼 클릭 (모든 rule 제거)
  const handleReset = () => {
    setRules([]);
  };

  // Cancel 버튼 클릭 (작업 내용 버림)
  const handleCancel = () => {
    // rules 변경사항을 버리고 appliedRules로 복원
    setRules(appliedRules.map((rule) => ({ ...rule })));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Sonamu Filter</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          {/* Rules */}
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No rules yet. Click "+ Add Rule" to start.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  fieldMeta={fieldMeta}
                  onUpdate={(updates) => updateRule(rule.id, updates)}
                  onRemove={() => removeRule(rule.id)}
                />
              ))}
            </div>
          )}

          {/* Add Rule Button */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={addRule} className="flex-1">
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
            {rules.length > 0 && (
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Clear All
              </Button>
            )}
          </div>

          {/* Preview JSON */}
          {rules.length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="text-sm font-semibold mb-2">Preview (JSON)</h4>
              <pre className="text-xs overflow-auto max-h-[200px] bg-background p-3 rounded border">
                {JSON.stringify(buildFilterQuery(), null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply Filter</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
