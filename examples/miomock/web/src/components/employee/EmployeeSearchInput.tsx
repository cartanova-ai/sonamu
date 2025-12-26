import { Icon, type IconProps } from "@iconify/react";
import { Button, Input } from "@sonamu-kit/react-components/components";
import type React from "react";
import { useState } from "react";
import { EmployeeSearchFieldDropdown } from "@/components/employee/EmployeeSearchFieldDropdown";

// Icons
const SearchIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:search" {...props} />;

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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 h-8 w-8"
          onClick={handleSearch}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
