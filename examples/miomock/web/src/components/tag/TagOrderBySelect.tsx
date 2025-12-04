import { Dropdown, type DropdownProps } from "semantic-ui-react";

import { TagOrderBy, TagOrderByLabel } from "../../services/sonamu.generated";

export type TagOrderBySelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function TagOrderBySelect({ placeholder, textPrefix, ...props }: TagOrderBySelectProps) {
  const typeOptions = TagOrderBy.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "정렬: ") + TagOrderByLabel[key],
  }));

  return (
    <Dropdown
      placeholder={placeholder ?? "정렬"}
      selection
      options={typeOptions}
      selectOnBlur={false}
      {...props}
    />
  );
}
