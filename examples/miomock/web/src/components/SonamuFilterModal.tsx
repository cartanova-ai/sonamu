import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@sonamu-kit/react-components/components";
import { useState } from "react";
import type { z } from "zod";
import type { FilterPropType } from "@/services/sonamu.shared";
import { operatorsByPropType } from "@/services/sonamu.shared";

type FieldMeta = {
  propType: FilterPropType;
  nullable: boolean;
  enumId?: unknown;
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

type SonamuFilterModalProps = {
  baseSchema: z.ZodObject<z.ZodRawShape>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SonamuFilterModal({ baseSchema, open, onOpenChange }: SonamuFilterModalProps) {
  const [selectedField, setSelectedField] = useState<string | null>(null);

  // baseSchema에서 동적으로 FieldMeta 추출
  const fieldMeta = extractFieldMetaFromSchema(baseSchema);
  const fields = Object.keys(fieldMeta);

  // 선택된 필드의 허용 연산자 가져오기
  const getOperatorsForField = (fieldName: string) => {
    const meta = fieldMeta[fieldName];
    if (!meta) return [];

    return operatorsByPropType[meta.propType];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Sonamu Filter - Project</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* 왼쪽: 필드 목록 */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 text-sm">Fields</h3>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {fields.map((field) => (
                <button
                  type="button"
                  key={field}
                  onClick={() => setSelectedField(field)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedField === field ? "bg-blue-100 hover:bg-blue-200" : "hover:bg-gray-100"
                  }`}
                >
                  {field}
                </button>
              ))}
            </div>
          </div>

          {/* 오른쪽: 허용 연산자 */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 text-sm">Allowed Operators</h3>
            {selectedField ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-2">
                  Field: <span className="font-medium">{selectedField}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {getOperatorsForField(selectedField).map((op) => (
                    <span key={op} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                      {op}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Select a field to see allowed operators</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
