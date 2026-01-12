import { Sonamu } from "../../api/sonamu";
import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { ensureDictKeys } from "../../utils/dict-utils";
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

  async render({ entityId }: TemplateOptions["view_search_input"]) {
    const names = EntityManager.getNamesFromId(entityId);

    // i18n 설정 확인
    const useI18n = !!Sonamu.config.i18n;
    if (useI18n) {
      await ensureDictKeys(["common.searchPlaceholder"], "web");
    }

    // SD import
    const sdImport = useI18n ? `import { SD } from "@/i18n/sd.generated";\n` : "";
    const placeholder = useI18n ? `{SD("common.searchPlaceholder")}` : `"검색..."`;

    return {
      ...this.getTargetAndPath(names),
      body: `
import { Button, Input } from "@sonamu-kit/react-components/components";
import type React from "react";
import { useState } from "react";
import { ${names.capital}SearchFieldSelect } from "@/components/${names.fs}/${names.capital}SearchFieldSelect";
import SearchIcon from "~icons/lucide/search";
${sdImport}
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
      <${names.capital}SearchFieldSelect {...dropdownProps} />
      <div className="relative flex items-center">
        <Input
          type="text"
          placeholder=${placeholder}
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
