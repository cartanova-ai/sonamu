import React, { useState, useEffect, SyntheticEvent } from "react";
import {
  DropdownProps,
  DropdownItemProps,
  DropdownOnSearchChangeData,
  Dropdown,
} from "semantic-ui-react";
import {
  EmployeeSubsetKey,
  EmployeeSubsetMapping,
} from "src/services/sonamu.generated";
import { EmployeeService } from "src/services/employee/employee.service";
import { EmployeeListParams } from "src/services/employee/employee.types";

export function EmployeeIdAsyncSelect<T extends EmployeeSubsetKey>({
  subset,
  baseListParams,
  textField,
  valueField,
  ...props
}: DropdownProps & {
  subset: T;
  baseListParams?: EmployeeListParams;
  textField?: keyof EmployeeSubsetMapping[T];
  valueField?: keyof EmployeeSubsetMapping[T];
}) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);
  const [listParams, setListParams] = useState<EmployeeListParams>(
    baseListParams ?? {}
  );

  const { data, error } = EmployeeService.useEmployees(subset, listParams);
  const { rows: employees, total } = data ?? {};

  useEffect(() => {
    setOptions(
      (employees ?? []).map((employee) => {
        const displayText = textField
          ? String(employee[textField])
          : `${employee.user?.username} (${employee.employee_number})${
              employee.department?.name ? ` - ${employee.department.name}` : ""
            }`;

        return {
          key: employee.id,
          value: employee[valueField ?? "id"] as string | number,
          text: displayText,
        };
      })
    );
  }, [employees, textField, valueField]);

  useEffect(() => {
    setListParams({
      ...listParams,
      ...baseListParams,
    });
  }, [baseListParams]);

  const handleSearchChange = (
    e: SyntheticEvent<HTMLElement, Event>,
    data: DropdownOnSearchChangeData
  ) => {
    setListParams({
      ...listParams,
      keyword: data.searchQuery,
    });
  };

  return (
    <Dropdown
      placeholder="직원"
      selection
      options={options}
      onSearchChange={handleSearchChange}
      disabled={!employees}
      loading={!employees}
      selectOnBlur={false}
      {...props}
    />
  );
}
