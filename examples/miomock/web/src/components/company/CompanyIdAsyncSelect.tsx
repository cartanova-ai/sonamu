import React, { useState, useEffect, SyntheticEvent } from "react";
import {
  DropdownProps,
  DropdownItemProps,
  DropdownOnSearchChangeData,
  Dropdown,
} from "semantic-ui-react";
import {
  CompanySubsetKey,
  CompanySubsetMapping,
} from "src/services/sonamu.generated";
import { CompanyService } from "src/services/company/company.service";
import { CompanyListParams } from "src/services/company/company.types";

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
  const [listParams, setListParams] = useState<CompanyListParams>(
    baseListParams ?? {},
  );

  const { data, error } = CompanyService.useCompanies(subset, listParams);
  const { rows: companies, total } = data ?? {};

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
  }, [companies]);

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
