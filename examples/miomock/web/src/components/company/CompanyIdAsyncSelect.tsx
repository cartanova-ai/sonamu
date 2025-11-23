import { type SyntheticEvent, useEffect, useState } from "react";
import {
  Dropdown,
  type DropdownItemProps,
  type DropdownOnSearchChangeData,
  type DropdownProps,
} from "semantic-ui-react";
import { CompanyService } from "src/services/company/company.service";
import type { CompanyListParams } from "src/services/company/company.types";
import type { CompanySubsetKey, CompanySubsetMapping } from "src/services/sonamu.generated";

export function CompanyIdAsyncSelect<T extends CompanySubsetKey>({
  subset,
  baseListParams,
  textField,
  valueField,
  ...props
}: DropdownProps & {
  subset: T;
  baseListParams?: CompanyListParams;
  textField?: keyof CompanySubsetMapping[T];
  valueField?: keyof CompanySubsetMapping[T];
}) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);
  const [listParams, setListParams] = useState<CompanyListParams>(baseListParams ?? {});

  const { data } = CompanyService.useCompanies(subset, listParams);
  const { rows: companies } = data ?? {};

  useEffect(() => {
    setOptions(
      (companies ?? []).map((company) => {
        return {
          key: company.id,
          value: company[valueField ?? "id"] as string | number,
          text: String(company[textField ?? "name"]),
        };
      }),
    );
  }, [companies, textField, valueField]);

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
      placeholder="COMPANY"
      selection
      options={options}
      onSearchChange={handleSearchChange}
      disabled={!companies}
      loading={!companies}
      selectOnBlur={false}
      {...props}
    />
  );
}
