import { DateInput, DatePicker, Input, Select } from "../..";
import { RangeNumberInput } from "../range-number-input";
import { EnumSelect } from "../select/enum-select";
import { TagInput } from "../tag-input";
import type { ValueInputProps } from "./types";

/**
 * ValueInput 컴포넌트
 * operator와 propType에 따라 적절한 입력 UI 렌더링
 */
export function ValueInput({ propType, operator, value, onChange, fieldMeta }: ValueInputProps) {
  // isNull/isNotNull: Boolean select (true/false)
  if (operator === "isNull" || operator === "isNotNull") {
    return (
      <Select
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
      <Select
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
