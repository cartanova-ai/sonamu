import { useState } from "react";

type StringArrayInputProps = {
  value: string[];
  onChange: (_e: {}, data: { value: string[] }) => void;
};
export function StringArrayInput({ value, onChange }: StringArrayInputProps) {
  const [inputValue, setInputValue] = useState<string>("");

  const handleUserInput = (userInput: string) => {
    if (userInput.endsWith(",") || userInput.endsWith(" ")) {
      const newValue = userInput.replace(/[, ]$/, "");
      if (newValue !== "") {
        onChange({}, { value: [...value, userInput.replace(/[, ]$/, "")] });
      }
      setInputValue("");
    } else {
      setInputValue(userInput);
    }
  };

  return (
    <div>
      <div className="string-array-input">
        {value.map((v) => (
          <div key={v} className="old-value">
            {v}
            <span
              className="remove-button"
              onClick={() =>
                onChange(
                  {},
                  {
                    value: value.filter((vv) => vv !== v),
                  }
                )
              }
            >
              ❌
            </span>
          </div>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleUserInput(e.target.value)}
        />
      </div>
    </div>
  );
}
