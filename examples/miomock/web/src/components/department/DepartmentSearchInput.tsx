import { useState } from "react";
import { type DropdownProps, Input, type InputProps } from "semantic-ui-react";
import { DepartmentSearchFieldDropdown } from "../../components/department/DepartmentSearchFieldDropdown";

export function DepartmentSearchInput({
  input: { value: inputValue, onChange: inputOnChange, ...inputProps },
  dropdown: dropdownProps,
}: {
  input: InputProps;
  dropdown: DropdownProps;
}) {
  const [keyword, setKeyword] = useState<string>(inputValue ?? "");

  const handleKeyDown = (e: { key: string }) => {
    if (inputOnChange && e.key === "Enter") {
      // biome-ignore lint/suspicious/noExplicitAny: handleKeyDown 동시 사용을 위해 허용
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
      label={<DepartmentSearchFieldDropdown {...dropdownProps} />}
      labelPosition="left"
      action={{
        icon: "search",
        onClick: () => handleKeyDown({ key: "Enter" }),
      }}
      {...inputProps}
      value={keyword}
      onChange={(_e, { value }) => setKeyword(value)}
      onKeyDown={handleKeyDown}
    />
  );
}
