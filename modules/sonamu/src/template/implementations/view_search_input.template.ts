import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { Template } from "../template";

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

  override getRequiredDictKeys(): string[] | null {
    return ["common.searchPlaceholder"];
  }

  async render({ entityId }: TemplateOptions["view_search_input"]) {
    const names = EntityManager.getNamesFromId(entityId);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { Button, EnumSelect, Input } from "@sonamu-kit/react-components/components";
import { useSonamuBaseContext } from "@sonamu-kit/react-components/contexts";
import type React from "react";
import { useState } from "react";
import { ${names.capital}SearchField, ${names.capital}SearchFieldLabel } from "@/services/sonamu.generated";
import SearchIcon from "~icons/lucide/search";
import { SD } from "@/i18n/sd.generated";
export type ${names.capital}SearchInputProps = {
  input: {
    value?: string;
    onValueChange?: (value: string | null | undefined) => void;
  };
  dropdown: {
    value?: string;
    onValueChange?: (value: string | null | undefined) => void;
  };
};

export function ${names.capital}SearchInput({
  input: { value: inputValue, onValueChange: inputOnValueChange },
  dropdown: dropdownProps,
}: ${names.capital}SearchInputProps) {
  const [keyword, setKeyword] = useState<string>(inputValue ?? "");

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
        enum={${names.capital}SearchField}
        labels={${names.capital}SearchFieldLabel}
        value={dropdownProps.value}
        onValueChange={(value) => {
          dropdownProps.onValueChange?.(value as string | null | undefined);
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
      `.trim(),
      importKeys: [],
    };
  }
}
