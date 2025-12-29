import { Button, Input } from "@sonamu-kit/react-components/components";
import type React from "react";
import { useState } from "react";
import { ProjectSearchFieldDropdown } from "@/components/project/ProjectSearchFieldDropdown";
import SearchIcon from "~icons/lucide/search";

export type ProjectSearchInputProps = {
  input: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
  dropdown: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  };
};

export function ProjectSearchInput({
  input: { value: inputValue, onChange: inputOnChange },
  dropdown: dropdownProps,
}: ProjectSearchInputProps) {
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
      <ProjectSearchFieldDropdown {...dropdownProps} />
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
