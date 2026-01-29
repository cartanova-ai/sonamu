import * as SelectPrimitive from "@radix-ui/react-select";
import * as React from "react";
import CheckIcon from "~icons/lucide/check";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronUpIcon from "~icons/lucide/chevron-up";
import XCircleIcon from "~icons/lucide/x-circle";
import type { Override } from "../../lib/types";
import { cn } from "../../lib/utils";

// 아이템 요소에서 value 타입을 추출합니다.
type ExtractValue<Item> = Item extends { value: infer V } ? V : Item;

// 아이템 정의: 값만 넘기거나 { value, label, disabled } 형태로 넘길 수 있습니다.
// SelectItemDef는 export용으로 사용되며, 내부적으로는 Item 제네릭을 직접 사용합니다.
type SelectItemDef<V> = V | { value: V; label?: React.ReactNode; disabled?: boolean };

// 기본 props 타입으로 Item을 제네릭 파라미터로 사용하고, value의 타입은 ExtractValue<Item>으로 추출합니다.
type SelectPropsBase<Item> = Override<
  Omit<
    React.ComponentProps<typeof SelectPrimitive.Root>,
    "value" | "defaultValue" | "onValueChange" | "children"
  >,
  {
    name?: string;
    value?: ExtractValue<Item>;
    defaultValue?: ExtractValue<Item>;
    onValueChange?: (value: ExtractValue<Item> | undefined) => void;
    onBlur?: React.FocusEventHandler<HTMLSelectElement>;
    items: Item[];
    placeholder?: string;
    clearable?: boolean;
    className?: string;
    contentClassName?: string;
    renderItem?: (value: ExtractValue<Item>) => React.ReactNode;
  }
>;

// string | number일 때는 valueKey 선택적, 그 외에는 필수
type SelectProps<Item> =
  ExtractValue<Item> extends string | number
    ? SelectPropsBase<Item> & { valueKey?: (value: ExtractValue<Item>) => string }
    : SelectPropsBase<Item> & { valueKey: (value: ExtractValue<Item>) => string };

// 아이템이 { value, label, disabled } 형태인지 확인
function isItemObject<V>(
  item: V | { value: V; label?: React.ReactNode; disabled?: boolean },
): item is { value: V; label?: React.ReactNode; disabled?: boolean } {
  return item !== null && typeof item === "object" && "value" in item;
}

function SelectInner<Item>(
  {
    name,
    value,
    defaultValue,
    onValueChange,
    onBlur,
    items,
    placeholder,
    clearable,
    className,
    contentClassName,
    valueKey,
    renderItem,
    disabled,
    ...props
  }: SelectProps<Item>,
  ref: React.ForwardedRef<HTMLSelectElement>,
) {
  type Value = ExtractValue<Item>;

  const selectRef = React.useRef<HTMLSelectElement>(null);
  React.useImperativeHandle(ref, () => selectRef.current as HTMLSelectElement);

  // 값 → 문자열 키 변환
  const getKeyForValue = React.useCallback(
    (val: Value): string => {
      if (val === undefined || val === null) return "";
      if (valueKey) return valueKey(val);
      return String(val);
    },
    [valueKey],
  );

  // 정규화된 아이템 목록과 키 매핑
  const { normalizedItems, valueByKey } = React.useMemo(() => {
    const normalized = items.map(
      (item): { value: Value; label?: React.ReactNode; disabled?: boolean } =>
        isItemObject(item)
          ? (item as { value: Value; label?: React.ReactNode; disabled?: boolean })
          : { value: item as Value },
    );
    const mapping = new Map<string, Value>();
    for (const item of normalized) {
      mapping.set(getKeyForValue(item.value), item.value);
    }
    return { normalizedItems: normalized, valueByKey: mapping };
  }, [items, getKeyForValue]);

  // Radix로부터 string key를 받아 원래 값으로 변환
  const handleValueChange = (stringKey: string) => {
    const actualValue = valueByKey.get(stringKey);
    onValueChange?.(actualValue);
  };

  const handleClear = (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onValueChange?.(undefined);
  };

  const stringValue = value !== undefined ? getKeyForValue(value) : undefined;
  const stringDefaultValue = defaultValue !== undefined ? getKeyForValue(defaultValue) : undefined;
  const hasValue = value !== undefined;

  // 아이템 렌더링
  const getItemLabel = (item: { value: Value; label?: React.ReactNode }): React.ReactNode => {
    if (item.label !== undefined) return item.label;
    if (renderItem) return renderItem(item.value);
    return String(item.value);
  };

  return (
    <>
      <select
        ref={selectRef}
        name={name}
        defaultValue={stringDefaultValue}
        value={stringValue}
        onBlur={onBlur}
        onChange={() => {}}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        <option value={stringValue || stringDefaultValue || ""} />
      </select>
      <SelectPrimitive.Root
        value={stringValue}
        defaultValue={stringDefaultValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        {...props}
      >
        <SelectPrimitive.Trigger
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background data-placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className="flex-1 truncate text-left">
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <div className="flex items-center gap-1 shrink-0 pl-2">
            {clearable && hasValue && (
              <XCircleIcon
                className="h-4 w-4 cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                onPointerDownCapture={handleClear}
                onMouseDownCapture={handleClear}
              />
            )}
            <SelectPrimitive.Icon asChild>
              <ChevronDownIcon className="h-4 w-4 opacity-50" />
            </SelectPrimitive.Icon>
          </div>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={cn(
              "relative z-50 max-h-100 min-w-32 overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin]",
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
              contentClassName,
            )}
            position="popper"
          >
            <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
              <ChevronUpIcon className="h-4 w-4" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)">
              {normalizedItems.map((item) => {
                const key = getKeyForValue(item.value);
                return (
                  <SelectPrimitive.Item
                    key={key}
                    value={key}
                    disabled={item.disabled}
                    className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <SelectPrimitive.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </SelectPrimitive.ItemIndicator>
                    </span>
                    <SelectPrimitive.ItemText>{getItemLabel(item)}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
              <ChevronDownIcon className="h-4 w-4" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </>
  );
}

const Select = React.forwardRef(SelectInner) as <Item>(
  props: SelectProps<Item> & React.RefAttributes<HTMLSelectElement>,
) => React.ReactElement;

export { Select };
export type { SelectProps, SelectItemDef, ExtractValue };
