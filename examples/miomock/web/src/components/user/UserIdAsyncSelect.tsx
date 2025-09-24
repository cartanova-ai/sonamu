import React, { useState, useEffect, SyntheticEvent } from "react";
import {
  DropdownProps,
  DropdownItemProps,
  DropdownOnSearchChangeData,
  Dropdown,
} from "semantic-ui-react";
import {
  UserSubsetKey,
  UserSubsetMapping,
} from "src/services/sonamu.generated";
import { UserService } from "src/services/user/user.service";
import { UserListParams } from "src/services/user/user.types";

export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  baseListParams,
  textField,
  valueField,
  ...props
}: DropdownProps & {
  subset: T;
  baseListParams?: UserListParams;
  textField?: keyof UserSubsetMapping[T];
  valueField?: keyof UserSubsetMapping[T];
}) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);
  const [listParams, setListParams] = useState<UserListParams>(
    baseListParams ?? {},
  );

  const { data, error } = UserService.useUsers(subset, listParams);
  const { rows: users, total } = data ?? {};

  useEffect(() => {
    setOptions(
      (users ?? []).map((user) => {
        return {
          key: user.id,
          value: user[valueField ?? "id"] as string | number,
          text: String(user[textField ?? "email"]),
        };
      }),
    );
  }, [users]);

  useEffect(() => {
    setListParams({
      ...listParams,
      ...baseListParams,
    });
  }, [baseListParams]);

  const handleSearchChange = (
    e: SyntheticEvent<HTMLElement, Event>,
    data: DropdownOnSearchChangeData,
  ) => {
    setListParams({
      ...listParams,
      keyword: data.searchQuery,
    });
  };

  return (
    <Dropdown
      placeholder="USER"
      selection
      options={options}
      onSearchChange={handleSearchChange}
      disabled={!users}
      loading={!users}
      selectOnBlur={false}
      {...props}
    />
  );
}
