import { type SyntheticEvent, useEffect, useState } from "react";
import {
  Dropdown,
  type DropdownItemProps,
  type DropdownOnSearchChangeData,
  type DropdownProps,
} from "semantic-ui-react";
import { ProjectService } from "src/services/project/project.service";
import type { ProjectListParams } from "src/services/project/project.types";
import type { ProjectSubsetKey, ProjectSubsetMapping } from "src/services/sonamu.generated";

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
  const [listParams, setListParams] = useState<ProjectListParams>(baseListParams ?? {});

  const { data } = ProjectService.useProjects(subset, listParams);
  const { rows: projects } = data ?? {};

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
  }, [projects, valueField, textField]);

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
