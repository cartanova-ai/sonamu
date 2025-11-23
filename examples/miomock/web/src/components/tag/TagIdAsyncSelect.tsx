import { type SyntheticEvent, useEffect, useState } from "react";
import {
  Dropdown,
  type DropdownItemProps,
  type DropdownOnSearchChangeData,
  type DropdownProps,
} from "semantic-ui-react";
import type { TagSubsetKey, TagSubsetMapping } from "src/services/sonamu.generated";
import { TagService } from "src/services/tag/tag.service";
import type { TagListParams } from "src/services/tag/tag.types";

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
  const [listParams, setListParams] = useState<TagListParams>(baseListParams ?? {});

  const { data } = TagService.useTags(subset, listParams);
  const { rows: tags } = data ?? {};

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
  }, [tags, valueField, textField]);

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
