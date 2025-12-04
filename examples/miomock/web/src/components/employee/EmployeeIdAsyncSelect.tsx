import { type SyntheticEvent, useEffect, useState } from "react";
import {
  Dropdown,
  type DropdownItemProps,
  type DropdownOnSearchChangeData,
  type DropdownProps,
} from "semantic-ui-react";
import { EmployeeService } from "../../services/employee/employee.service";
import type { EmployeeListParams } from "../../services/employee/employee.types";
import type { EmployeeSubsetKey, EmployeeSubsetMapping } from "../../services/sonamu.generated";

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
  const [listParams, setListParams] = useState<EmployeeListParams>(baseListParams ?? {});

  const { data } = EmployeeService.useEmployees(subset, listParams);
  const { rows: employees } = data ?? {};

  useEffect(() => {
    setOptions(
      (employees ?? []).map((employee) => {
        // textField가 지정되지 않은 경우, user.username과 employee_number를 조합
        const text = (() => {
          if (textField) {
            return String(employee[textField]);
          }

          if (subset === "A") {
            const e = employee as EmployeeSubsetMapping["A"];
            return `${e.user.username}-${e.employee_number}`;
          } else if (subset === "P") {
            const e = employee as EmployeeSubsetMapping["P"];
            return `${e.user.username}-${e.user.employee?.employee_number}`;
          } else {
            throw new Error(`Unexpected subset: ${subset}`);
          }
        })();

        return {
          key: employee.id,
          value: employee[valueField ?? "id"] as string | number,
          text,
        };
      }),
    );
  }, [employees, textField, valueField, subset]);

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
