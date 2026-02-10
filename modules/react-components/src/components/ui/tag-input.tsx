import { useState } from "react";
import XIcon from "~icons/lucide/x";
import { Badge } from "./badge";

export type TagInputProps = {
  value?: string[];
  onChange?: (value: string[]) => void;
  type?: "text" | "number";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Tag Input 컴포넌트
 *
 * 콤마 또는 Enter로 태그 추가
 * X 버튼으로 태그 제거
 */
export function TagInput({
  value = [],
  onChange,
  type = "text",
  placeholder,
  disabled,
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addTag = (tagValue: string) => {
    const trimmed = tagValue.trim();
    if (!trimmed) return;

    // 숫자 타입인 경우 검증
    if (type === "number") {
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return; // 숫자가 아니면 무시
      }
    }

    // 중복 방지
    if (value.includes(trimmed)) {
      setInputValue("");
      return;
    }

    onChange?.([...value, trimmed]);
    setInputValue("");
  };

  const removeTag = (index: number) => {
    onChange?.(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Backspace로 마지막 태그 제거
      removeTag(value.length - 1);
    }
  };

  const handleBlur = () => {
    // blur 시 입력값이 있으면 태그로 추가
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // 콤마 입력 시 태그 추가
    if (newValue.includes(",")) {
      const parts = newValue.split(",");
      parts.slice(0, -1).map((part) => addTag(part));
      setInputValue(parts[parts.length - 1]);
      return;
    }

    setInputValue(newValue);
  };

  return (
    <div
      className={`flex flex-wrap gap-1 items-center border rounded-md p-2 min-h-[40px] ${
        disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"
      } ${className}`}
    >
      {/* Tags */}
      {value.map((tag, index) => (
        <Badge key={index} variant="secondary" className="flex items-center gap-1 px-2 py-1">
          <span>{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="hover:bg-gray-300 rounded-full p-0.5"
            >
              <XIcon />
            </button>
          )}
        </Badge>
      ))}

      {/* Input */}
      {!disabled && (
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? (placeholder ?? "Enter 또는 콤마로 구분...") : ""}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
          disabled={disabled}
        />
      )}
    </div>
  );
}
