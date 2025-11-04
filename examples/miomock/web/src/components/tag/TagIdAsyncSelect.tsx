import React, { useState, useEffect, SyntheticEvent } from "react";
import {
  DropdownProps,
  DropdownItemProps,
  DropdownOnSearchChangeData,
  Dropdown,
} from "semantic-ui-react";
import { TagSubsetKey, TagSubsetMapping } from "src/services/sonamu.generated";
import { TagService } from "src/services/tag/tag.service";
import { TagListParams } from "src/services/tag/tag.types";

export function TagIdAsyncSelect<T extends TagSubsetKey>({
  subset,
  baseListParams,
  textField,
  valueField,
  ...props
}: DropdownProps & {
  subset: T;
  baseListParams?: TagListParams;
  textField?: keyof TagSubsetMapping[T];
  valueField?: keyof TagSubsetMapping[T];
}) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);
  const [listParams, setListParams] = useState<TagListParams>(
    baseListParams ?? {},
  );

  const { data, error } = TagService.useTags(subset, listParams);
  const { rows: tags, total } = data ?? {};

  useEffect(() => {
    setOptions(
      (tags ?? []).map((tag) => {
        return {
          key: tag.id,
          value: tag[valueField ?? "id"] as string | number,
          text: String(tag[textField ?? "name"]),
        };
      }),
    );
  }, [tags]);

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
      placeholder="TAG"
      selection
      options={options}
      onSearchChange={handleSearchChange}
      disabled={!tags}
      loading={!tags}
      selectOnBlur={false}
      {...props}
    />
  );
}
