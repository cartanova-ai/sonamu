import React, { useState, useEffect, SyntheticEvent } from "react";
import {
  DropdownProps,
  DropdownItemProps,
  DropdownOnSearchChangeData,
  Dropdown,
} from "semantic-ui-react";
import {
  ProjectSubsetKey,
  ProjectSubsetMapping,
} from "src/services/sonamu.generated";
import { ProjectService } from "src/services/project/project.service";
import { ProjectListParams } from "src/services/project/project.types";

export function ProjectIdAsyncSelect<T extends ProjectSubsetKey>({
  subset,
  baseListParams,
  textField,
  valueField,
  ...props
}: DropdownProps & {
  subset: T;
  baseListParams?: ProjectListParams;
  textField?: keyof ProjectSubsetMapping[T];
  valueField?: keyof ProjectSubsetMapping[T];
}) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);
  const [listParams, setListParams] = useState<ProjectListParams>(
    baseListParams ?? {},
  );

  const { data, error } = ProjectService.useProjects(subset, listParams);
  const { rows: projects, total } = data ?? {};

  useEffect(() => {
    setOptions(
      (projects ?? []).map((project) => {
        return {
          key: project.id,
          value: project[valueField ?? "id"] as string | number,
          text: String(project[textField ?? "name"]),
        };
      }),
    );
  }, [projects]);

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
      placeholder="PROJECT"
      selection
      options={options}
      onSearchChange={handleSearchChange}
      disabled={!projects}
      loading={!projects}
      selectOnBlur={false}
      {...props}
    />
  );
}
