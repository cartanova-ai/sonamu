import { EntityManager, type EntityNamesRecord } from "../entity/entity-manager";
import type { TemplateOptions } from "../types/types";
import { Template } from "./base-template";

export class Template__view_search_input extends Template {
  constructor() {
    super("view_search_input");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${names.capital}SearchInput.tsx`,
    };
  }

  render({ entityId }: TemplateOptions["view_search_input"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import React, { useState } from "react";
import { Search } from "lucide-react";
import { Input, Button } from "@sonamu-kit/react-components/components";
import { ${names.capital}SearchFieldDropdown } from "./${names.capital}SearchFieldDropdown";

export type ${names.capital}SearchInputProps = {
  input: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
  dropdown: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  };
};

export function ${names.capital}SearchInput({
  input: { value: inputValue, onChange: inputOnChange },
  dropdown: dropdownProps,
}: ${names.capital}SearchInputProps) {
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
      <${names.capital}SearchFieldDropdown {...dropdownProps} />
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
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}
