import React from "react";
import { useState } from "react";
import { DropdownProps, Input, InputProps } from "semantic-ui-react";
import { FileSearchFieldDropdown } from "src/components/file/FileSearchFieldDropdown";

export function FileSearchInput({
  input: { value: inputValue, onChange: inputOnChange, ...inputProps },
  dropdown: dropdownProps,
}: {
  input: InputProps;
  dropdown: DropdownProps;
}) {
  const [keyword, setKeyword] = useState<string>(inputValue ?? "");

  const handleKeyDown = (e: { key: string }) => {
    if (inputOnChange && e.key === "Enter") {
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
      label={<FileSearchFieldDropdown {...dropdownProps} />}
      labelPosition="left"
      action={{
        icon: "search",
        onClick: () => handleKeyDown({ key: "Enter" }),
      }}
      {...inputProps}
      value={keyword}
      onChange={(e, { value }) => setKeyword(value)}
      onKeyDown={handleKeyDown}
    />
  );
}
