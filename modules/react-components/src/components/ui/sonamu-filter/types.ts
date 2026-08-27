import { type z } from "zod";

import { type FilterOperator, type FilterPropType } from "../../../lib/types";

/**
 * 필드 메타 정보
 */
export type FieldMeta = {
  propType: FilterPropType;
  nullable: boolean;
  enumData?: {
    options: string[];
    labels: Record<string, string>;
  };
};
export type FilterFieldMetadata = Record<string, FieldMeta>;

/**
 * Rule 타입 정의
 */
export type Rule = {
  id: string;
  field: string | null;
  operator: FilterOperator | null;
  value: FilterValue;
};

export type FilterScalar = string | number | boolean | Date | null | undefined;
export type FilterValue = FilterScalar | FilterScalar[];
export type FilterExpression = Partial<Record<FilterOperator, FilterValue>>;
export type FilterQuery = Record<string, FilterExpression>;

/**
 * Zod 내부 API 접근을 위한 타입 정의
 */
export type ZodDef = {
  type: string;
  innerType?: z.ZodTypeAny;
  description?: string;
};

export type ZodWithDef = z.ZodTypeAny & {
  _def: ZodDef;
};

/**
 * SonamuFilterModal Props
 */
export type SonamuFilterModalProps = {
  baseSchema: z.ZodObject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRules?: Rule[];
  onApply?: (filters: FilterQuery, rules: Rule[]) => void;
};

/**
 * ValueInput Props
 */
export type ValueInputProps = {
  propType: FilterPropType;
  operator: FilterOperator;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  fieldMeta?: FieldMeta;
};

/**
 * RuleRow Props
 */
export type RuleRowProps = {
  rule: Rule;
  fieldMeta: FilterFieldMetadata;
  onUpdate: (updates: Partial<Rule>) => void;
  onRemove: () => void;
};

/**
 * SonamuFilterBadge Props
 */
export type SonamuFilterBadgeProps = {
  rules: Rule[];
  fieldMeta: FilterFieldMetadata;
  onRemove: (ruleId: string) => void;
  onClearAll: () => void;
};

/**
 * SonamuFilterTooltip Props (deprecated - use SonamuFilterPopoverProps)
 */
export type SonamuFilterTooltipProps = SonamuFilterPopoverProps;

/**
 * SonamuFilterPopover Props
 */
export type SonamuFilterPopoverProps = {
  rules: Rule[];
  fieldMeta: FilterFieldMetadata;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
};
