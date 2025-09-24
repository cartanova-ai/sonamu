import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { CompanySearchFieldLabel } from "src/services/sonamu.generated";

export function CompanySearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(CompanySearchFieldLabel).map(
    ([key, label]) => {
      return {
        key,
        value: key,
        text: "검색: " + label,
      };
    },
  );
  return <Dropdown className="label" options={options} {...props} />;
}
