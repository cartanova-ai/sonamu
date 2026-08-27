import { useSonamuBaseContext } from "../../../contexts/sonamu-context";
import { DateInput } from "../date-input";
import { DatePicker } from "../date-picker";
import { Input } from "../input";
import { RangeNumberInput } from "../range-number-input";
import { EnumSelect } from "../select/enum-select";
import { TagInput } from "../tag-input";
import { type ValueInputProps } from "./types";

// Boolean enum 상수
const BOOLEAN_ENUM = {
  options: ["true", "false"] as const,
  labels: { true: "True", false: "False" },
};
const stringValueSchema = z.string();
const stringValuesSchema = z.array(stringValueSchema);
const numberValueSchema = z.number();

function stringValues(value: ValueInputProps["value"]): string[] {
  const result = stringValuesSchema.safeParse(value);
  return result.success ? result.data : [];
}

function numberRange(value: ValueInputProps["value"]): [number | undefined, number | undefined] {
  if (!Array.isArray(value)) return [undefined, undefined];
  const [start, end] = value;
  const parsedStart = numberValueSchema.safeParse(start);
  const parsedEnd = numberValueSchema.safeParse(end);
  return [
    parsedStart.success ? parsedStart.data : undefined,
    parsedEnd.success ? parsedEnd.data : undefined,
  ];
}

function dateRange(value: ValueInputProps["value"]): [Date | undefined, Date | undefined] {
  if (!Array.isArray(value)) return [undefined, undefined];
  const [start, end] = value;
  return [start instanceof Date ? start : undefined, end instanceof Date ? end : undefined];
}

/**
 * ValueInput 컴포넌트
 * operator와 propType에 따라 적절한 입력 UI 렌더링
 */
export function ValueInput({ propType, operator, value, onChange, fieldMeta }: ValueInputProps) {
  const { SD } = useSonamuBaseContext();
  // isNull/isNotNull: Boolean select (true/false)
  if (operator === "isNull" || operator === "isNotNull") {
    return (
      <EnumSelect
        enum={{ options: BOOLEAN_ENUM.options }}
        labels={BOOLEAN_ENUM.labels}
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => v && onChange(v === "true")}
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
          value={stringValues(value)}
          onValueChange={onChange}
          multiple={true}
        />
      );
    }
    // string/number: TagInput
    return (
      <TagInput
        value={stringValues(value)}
        onChange={onChange}
        type={propType === "integer" || propType === "numeric" ? "number" : "text"}
      />
    );
  }

  // between: 범위 입력
  if (operator === "between") {
    if (propType === "integer" || propType === "numeric") {
      return <RangeNumberInput value={numberRange(value)} onChange={onChange} />;
    }
    if (propType === "date" || propType === "datetime") {
      // DateInput 2개로 범위 입력 (간단 버전)
      const [start, end] = dateRange(value);
      return (
        <div className="flex items-center gap-2">
          <DateInput
            value={start ?? null}
            onValueChange={(v) => onChange([v ?? undefined, end])}
            placeholder={SD("rc.sonamuFilter.startDate")}
            className="flex-1"
          />
          <span className="text-muted-foreground">~</span>
          <DateInput
            value={end ?? null}
            onValueChange={(v) => onChange([start, v ?? undefined])}
            placeholder={SD("rc.sonamuFilter.endDate")}
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
        value={stringValueSchema.safeParse(value).data ?? ""}
        onValueChange={onChange}
      />
    );
  }

  // date/datetime: DatePicker
  if (propType === "date" || propType === "datetime") {
    return (
      <DatePicker value={value instanceof Date ? value : undefined} onValueChange={onChange} />
    );
  }

  // string: text input
  if (propType === "string") {
    return (
      <Input
        type="text"
        value={stringValueSchema.safeParse(value).data ?? ""}
        onValueChange={onChange}
        placeholder={SD("rc.sonamuFilter.enterValue")}
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
        placeholder={SD("rc.sonamuFilter.enterNumber")}
      />
    );
  }

  // boolean: true/false select
  if (propType === "boolean") {
    return (
      <EnumSelect
        enum={{ options: BOOLEAN_ENUM.options }}
        labels={BOOLEAN_ENUM.labels}
        value={value === undefined ? "" : String(value)}
        onValueChange={(v) => v && onChange(v === "true")}
        className="w-full"
      />
    );
  }

  // json 타입은 isNull/isNotNull만 지원
  return <Input type="text" value="" placeholder={SD("rc.sonamuFilter.notSupported")} disabled />;
}
import { z } from "zod";
