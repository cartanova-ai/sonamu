import { Dropdown, type DropdownProps } from "semantic-ui-react";

import { TagSearchFieldLabel } from "../../services/sonamu.generated";

export function TagSearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(TagSearchFieldLabel).map(([key, label]) => {
    return {
      key,
      value: key,
      text: `검색: ${label}`,
    };
  });
  return <Dropdown className="label" options={options} {...props} />;
}
