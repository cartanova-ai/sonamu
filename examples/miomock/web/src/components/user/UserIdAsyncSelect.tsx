import { type SyntheticEvent, useEffect, useState } from "react";
import {
  Dropdown,
  type DropdownItemProps,
  type DropdownOnSearchChangeData,
  type DropdownProps,
} from "semantic-ui-react";
import { UserService } from "../../services/services.generated";
import type { UserSubsetKey, UserSubsetMapping } from "../../services/sonamu.generated";
import type { UserListParams } from "../../services/user/user.types";

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
  const [listParams, setListParams] = useState<UserListParams>(baseListParams ?? {});

  const { data } = UserService.useUsers(subset, listParams);
  const { rows: users } = data ?? {};

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
  }, [users, valueField, textField]);

  useEffect(() => {
    setListParams({
      ...listParams,
      ...baseListParams,
    });
  }, [baseListParams, listParams]);

  const handleSearchChange = (
    _e: SyntheticEvent<HTMLElement, Event>,
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
