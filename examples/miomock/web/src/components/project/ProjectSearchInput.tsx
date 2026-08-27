import { Button, EnumSelect, Input } from "@sonamu-kit/react-components/components";
import type React from "react";
import { useState } from "react";
import SearchIcon from "~icons/lucide/search";

import { SD } from "@/i18n/sd.generated";
import { ProjectSearchField, ProjectSearchFieldLabel } from "@/services/sonamu.generated";
export type ProjectSearchInputProps = {
  input: {
    value?: string;
    onValueChange?: (value: string | null | undefined) => void;
  };
  dropdown: {
    value?: string;
    onValueChange?: (value: string | null | undefined) => void;
  };
};

export function ProjectSearchInput({
  input: { value: inputValue, onValueChange: inputOnValueChange },
  dropdown: dropdownProps,
}: ProjectSearchInputProps) {
  const [keyword, setKeyword] = useState(inputValue ?? "");

  const handleSearch = () => {
    inputOnValueChange?.(keyword || undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <EnumSelect
        enum={ProjectSearchField}
        labels={ProjectSearchFieldLabel}
        value={dropdownProps.value}
        onValueChange={(value) => {
          if (!Array.isArray(value)) dropdownProps.onValueChange?.(value);
        }}
        placeholder={SD("common.search")}
        className="w-[150px] h-8"
      />
      <div className="relative flex items-center">
        <Input
          type="text"
          placeholder={SD("common.searchPlaceholder")}
          className="h-8 w-[200px] pr-8"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="button" variant="ghost" onClick={handleSearch} icon={<SearchIcon />} />
      </div>
    </div>
  );
}
