import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
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
import React from "react";
import { useState } from "react";
import { DropdownProps, Input, InputProps } from "semantic-ui-react";
import { ${names.capital}SearchFieldDropdown } from "src/components/${names.fs}/${names.capital}SearchFieldDropdown";

export function ${names.capital}SearchInput({
  input: { value: inputValue, onChange: inputOnChange, ...inputProps },
  dropdown: dropdownProps,
}: {
  input: InputProps;
  dropdown: DropdownProps;
}) {
  const [keyword, setKeyword] = useState<string>(inputValue ?? '');

  const handleKeyDown = (e: { key: string }) => {
    if (inputOnChange && e.key === 'Enter') {
      inputOnChange(e as any, {
        value: keyword,
      });
    }
  };

  return (
    <Input
      size="small"
      placeholder="검색..."
      style={{ margin: 0 }}
      label={<${names.capital}SearchFieldDropdown {...dropdownProps} />}
      labelPosition="left"
      action={{
        icon: 'search',
        onClick: () => handleKeyDown({ key: 'Enter' }),
      }}
      {...inputProps}
      value={keyword}
      onChange={(e, { value }) => setKeyword(value)}
      onKeyDown={handleKeyDown}
    />
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}
