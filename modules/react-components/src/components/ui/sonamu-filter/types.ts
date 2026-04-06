import type { z } from "zod";

import type { FilterOperator, FilterPropType } from "../../../lib/types";

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

/**
 * Rule 타입 정의
 */
export type Rule = {
  id: string;
  field: string | null;
  operator: FilterOperator | null;
  value: unknown;
};

/**
 * Zod 내부 API 접근을 위한 타입 정의
 */
export type ZodDef = {
  type: string;
  innerType?: z.ZodTypeAny;
  meta?: Record<string, unknown>;
};

export type ZodWithDef = z.ZodTypeAny & {
  _def: ZodDef;
};

/**
 * SonamuFilterModal Props
 */
export type SonamuFilterModalProps = {
  baseSchema: z.ZodObject<z.ZodRawShape>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRules?: Rule[];
  onApply?: (filters: Record<string, unknown>, rules: Rule[]) => void;
};

/**
 * ValueInput Props
 */
export type ValueInputProps = {
  propType: FilterPropType;
  operator: FilterOperator;
  value: unknown;
  onChange: (value: unknown) => void;
  fieldMeta?: FieldMeta;
};

/**
 * RuleRow Props
 */
export type RuleRowProps = {
  rule: Rule;
  fieldMeta: Record<string, FieldMeta>;
  onUpdate: (updates: Partial<Rule>) => void;
  onRemove: () => void;
};

/**
 * SonamuFilterBadge Props
 */
export type SonamuFilterBadgeProps = {
  rules: Rule[];
  fieldMeta: Record<string, FieldMeta>;
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
  fieldMeta: Record<string, FieldMeta>;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
};
