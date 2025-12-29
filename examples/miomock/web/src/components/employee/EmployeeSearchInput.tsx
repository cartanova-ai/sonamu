import { Button, Input } from "@sonamu-kit/react-components/components";
import type React from "react";
import { useState } from "react";
import { EmployeeSearchFieldDropdown } from "@/components/employee/EmployeeSearchFieldDropdown";
import SearchIcon from "~icons/lucide/search";

export type EmployeeSearchInputProps = {
  input: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
  dropdown: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  };
};

export function EmployeeSearchInput({
  input: { value: inputValue, onChange: inputOnChange },
  dropdown: dropdownProps,
}: EmployeeSearchInputProps) {
  const [keyword, setKeyword] = useState<string>(inputValue ?? "");

  const handleSearch = () => {
    if (inputOnChange) {
      const syntheticEvent = {
        target: { value: keyword },
        currentTarget: { value: keyword },
      } as React.ChangeEvent<HTMLInputElement>;
      inputOnChange(syntheticEvent);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <EmployeeSearchFieldDropdown {...dropdownProps} />
      <div className="relative flex items-center">
        <Input
          type="text"
          placeholder="검색..."
          className="h-8 w-[200px] pr-8"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="button" variant="ghost" icon={<SearchIcon />} onClick={handleSearch} />
      </div>
    </div>
  );
}
