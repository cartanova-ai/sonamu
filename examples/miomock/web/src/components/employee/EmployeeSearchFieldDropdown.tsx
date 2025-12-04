import { Dropdown, type DropdownProps } from "semantic-ui-react";

import { EmployeeSearchFieldLabel } from "../../services/sonamu.generated";

export function EmployeeSearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(EmployeeSearchFieldLabel).map(([key, label]) => {
    return {
      key,
      value: key,
      text: `검색: ${label}`,
    };
  });
  return <Dropdown className="label" options={options} {...props} />;
}
