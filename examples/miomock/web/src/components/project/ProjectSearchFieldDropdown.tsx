import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { ProjectSearchFieldLabel } from "src/services/sonamu.generated";

export function ProjectSearchFieldDropdown(props: DropdownProps) {
  const options = Object.entries(ProjectSearchFieldLabel).map(
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
