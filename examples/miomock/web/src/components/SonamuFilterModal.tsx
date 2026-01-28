import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sonamu-kit/react-components/components";
import { useEffect, useState } from "react";
import type { z } from "zod";
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
  enumId?: unknown;
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
  switch (typeName) {
    case "string":
      return "string";
    case "number":
      return "integer";
    case "boolean":
      return "boolean";
    case "date":
      return "datetime";
    case "enum":
      return "enum";
    case "array":
    case "object":
      return "json";
    default:
      return "string";
  }
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

    // 메타 SonamuPropType 체크 (최상위 레벨에서 .meta() 메서드 사용)
    // biome-ignore lint/suspicious/noExplicitAny: Zod meta() 메서드 접근
    const meta = (zodSchema as any).meta?.();
    const soanmuPropType = meta?.SonamuPropType;
    const isNumeric = soanmuPropType === "numeric";

    // propType 결정
    const innerWithDef = innerType as ZodWithDef;
    const propType: FilterPropType = isNumeric
      ? "numeric"
      : zodTypeNameToPropType(innerWithDef._def.type);

    fieldMeta[fieldName] = {
      propType,
      nullable,
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
 */
function ValueInput({
  propType,
  operator,
  value,
  onChange,
}: {
  propType: FilterPropType;
  operator: FilterOperator;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  // isNull/isNotNull: Boolean select (true/false)
  if (operator === "isNull" || operator === "isNotNull") {
    return (
      <Select
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => onChange(v === "true")}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">True</SelectItem>
          <SelectItem value="false">False</SelectItem>
        </SelectContent>
      </Select>
    );
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
      <Select
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => onChange(v === "true")}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">True</SelectItem>
          <SelectItem value="false">False</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // 기타 타입은 Phase 2 이상에서 구현
  return (
    <Input
      type="text"
      value={(value as string) ?? ""}
      onValueChange={onChange}
      placeholder="Not supported yet..."
      disabled
    />
  );
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
        <Select value={rule.field ?? ""} onValueChange={handleFieldChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select field..." />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
              <SelectItem key={field} value={field}>
                {field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator Select */}
      <div className="flex-1 min-w-[120px]">
        <Select
          value={rule.operator ?? ""}
          onValueChange={handleOperatorChange}
          disabled={!rule.field}
        >
          <SelectTrigger>
            <SelectValue placeholder="Operator..." />
          </SelectTrigger>
          <SelectContent>
            {allowedOperators.map((op) => (
              <SelectItem key={op} value={op}>
                {operatorLabels[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value Input */}
      <div className="flex-1 min-w-[150px]">
        {rule.operator && selectedFieldMeta ? (
          <ValueInput
            propType={selectedFieldMeta.propType}
            operator={rule.operator}
            value={rule.value}
            onChange={(newValue) => onUpdate({ value: newValue })}
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
