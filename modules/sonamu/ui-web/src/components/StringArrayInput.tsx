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
      <div className="m-0 outline-0 appearance-none leading-[1.21428571em] p-[0.47857143em_0.8em] text-base bg-white border border-[rgba(34,36,38,0.15)] text-[rgba(0,0,0,0.87)] rounded-[0.28571429rem] shadow-[0_0_0_0_transparent_inset] transition-[color_0.1s_ease,border-color_0.1s_ease] flex">
        {value.map((v) => (
          <div
            key={v}
            className="p-[0.2em_0.7em] mr-[0.3em] bg-[#b5d9bf] rounded-[0.3em] text-[0.8em]"
          >
            {v}
            <button
              type="button"
              style={{ display: "inline-block" }}
              className="ml-[0.4em] cursor-pointer"
              onClick={() =>
                onChange(
                  {},
                  {
                    value: value.filter((vv) => vv !== v),
                  },
                )
              }
            >
              ❌
            </button>
          </div>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleUserInput(e.target.value)}
          className="p-[0.2em]! pl-[0.2em]! m-0 border-0!"
        />
      </div>
    </div>
  );
}
