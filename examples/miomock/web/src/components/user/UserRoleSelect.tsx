import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import { UserRole, UserRoleLabel } from "src/services/sonamu.generated";

export type UserRoleSelectProps = {
  placeholder?: string;
  textPrefix?: string;
} & DropdownProps;
export function UserRoleSelect({
  placeholder,
  textPrefix,
  ...props
}: UserRoleSelectProps) {
  const typeOptions = UserRole.options.map((key) => ({
    key,
    value: key,
    text: (textPrefix ?? "ROLE: ") + UserRoleLabel[key],
  }));

  return (
    <Dropdown
      placeholder={placeholder ?? "ROLE"}
      selection
      options={typeOptions}
      selectOnBlur={false}
      {...props}
    />
  );
}
