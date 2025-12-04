import { Dropdown, type DropdownProps } from "semantic-ui-react";

import { FileSearchFieldLabel } from "../../services/sonamu.generated";

export function FileSearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(FileSearchFieldLabel).map(([key, label]) => {
    return {
      key,
      value: key,
      text: `검색: ${label}`,
    };
  });
  return <Dropdown className="label" options={options} {...props} />;
}
