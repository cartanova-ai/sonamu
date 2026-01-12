import { Button, Input } from "@sonamu-kit/react-components/components";
import type React from "react";
import { useState } from "react";
import { TagSearchFieldSelect } from "@/components/tag/TagSearchFieldSelect";
import { SD } from "@/i18n/sd.generated";
import SearchIcon from "~icons/lucide/search";

export type TagSearchInputProps = {
  input: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
  dropdown: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  };
};

export function TagSearchInput({
  input: { value: inputValue, onChange: inputOnChange },
  dropdown: dropdownProps,
}: TagSearchInputProps) {
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
      <TagSearchFieldSelect {...dropdownProps} />
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
