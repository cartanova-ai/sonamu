import { Input } from "@sonamu-kit/react-components/components";

export type RangeNumberInputProps = {
  value?: [number | undefined, number | undefined];
  onChange?: (value: [number | undefined, number | undefined]) => void;
  placeholder?: [string, string];
  disabled?: boolean;
  className?: string;
};

/**
 * Range Number Input 컴포넌트
 *
 * between 연산자에서 사용
 * [min, max] 두 개의 숫자 입력
 */
export function RangeNumberInput({
  value = [undefined, undefined],
  onChange,
  placeholder = ["최소값", "최대값"],
  disabled,
  className,
}: RangeNumberInputProps) {
  const [min, max] = value;

  const handleMinChange = (v: string) => {
    const newMin = v === "" ? undefined : Number(v);
    onChange?.([newMin, max]);
  };

  const handleMaxChange = (v: string) => {
    const newMax = v === "" ? undefined : Number(v);
    onChange?.([min, newMax]);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Input
        type="number"
        value={min === undefined ? "" : String(min)}
        onValueChange={handleMinChange}
        placeholder={placeholder[0]}
        disabled={disabled}
        className="flex-1"
      />
      <span className="text-muted-foreground">~</span>
      <Input
        type="number"
        value={max === undefined ? "" : String(max)}
        onValueChange={handleMaxChange}
        placeholder={placeholder[1]}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  );
}
