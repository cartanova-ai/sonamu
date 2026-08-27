import { z } from "zod";

import { useSonamuBaseContext } from "../../../contexts/sonamu-context";
import { datetimeF, numF } from "../../../lib/base-helpers";
import { type FilterOperator } from "../../../lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { operatorLabels } from "./constants";
import { type Rule, type SonamuFilterPopoverProps } from "./types";

const dateValueSchema = z.union([z.string(), z.date()]);
const numberValueSchema = z.union([
  z.number().finite(),
  z.string().trim().min(1).transform(Number).pipe(z.number().finite()),
]);

function getOperatorLabel(operator: FilterOperator | null): string {
  if (!operator) return "";
  return operatorLabels[operator];
}

/**
 * SonamuFilterPopover
 *
 * 필터 버튼에 적용된 필터를 Popover로 표시하는 컴포넌트
 * 필터가 적용되어 있으면 hover 없이도 항상 보임
 */
export function SonamuFilterPopover({
  rules,
  fieldMeta,
  children,
  side = "bottom",
  align = "start",
}: SonamuFilterPopoverProps) {
  const { SD } = useSonamuBaseContext();

  // Value 포맷팅
  const formatValue = (rule: Rule): string => {
    const { value, field, operator } = rule;

    // isNull/isNotNull은 value 표시하지 않음
    if (operator === "isNull" || operator === "isNotNull") {
      return "";
    }

    if (!field || value === undefined || value === null) {
      return "";
    }

    const meta = fieldMeta[field];
    if (!meta) return String(value);

    // Enum인 경우 라벨 표시
    if (meta.propType === "enum" && meta.enumData) {
      if (Array.isArray(value)) {
        return value.map((item) => String(meta.enumData?.labels[String(item)] ?? item)).join(", ");
      }
      return meta.enumData.labels[String(value)] || String(value);
    }

    // 날짜/시간인 경우
    if (meta.propType === "date" || meta.propType === "datetime") {
      if (Array.isArray(value)) {
        return value
          .map((item) => dateValueSchema.safeParse(item).data)
          .map(datetimeF)
          .join(" ~ ");
      }
      return datetimeF(dateValueSchema.safeParse(value).data) ?? "";
    }

    // 숫자인 경우
    if (meta.propType === "integer" || meta.propType === "numeric") {
      if (Array.isArray(value)) {
        return value
          .map((item) => numberValueSchema.safeParse(item).data)
          .map(numF)
          .join(" ~ ");
      }
      return String(numF(numberValueSchema.safeParse(value).data) ?? "");
    }

    // 배열인 경우
    if (Array.isArray(value)) {
      return value.join(", ");
    }

    return String(value);
  };

  // 필터가 없으면 children만 반환
  if (rules.length === 0) {
    return <>{children}</>;
  }

  return (
    <Popover open={true}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={5}
        className="p-3"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <div>
          <div className="text-xs font-semibold mb-2">{SD("rc.sonamuFilter.appliedFilters")}</div>
          <ul className="space-y-1.5 text-xs">
            {rules.map((rule) => {
              if (!rule.field || !rule.operator) return null;

              const operatorLabel = getOperatorLabel(rule.operator);
              const valueStr = formatValue(rule);

              return (
                <li key={rule.id} className="flex items-start gap-1">
                  <span className="text-muted-foreground">•</span>
                  <div>
                    <span className="font-medium">{rule.field}</span>{" "}
                    <span className="text-muted-foreground">{operatorLabel}</span>{" "}
                    {valueStr && <span>{valueStr}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
