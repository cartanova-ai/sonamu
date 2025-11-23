import { useEffect, useState } from "react";
import { Dropdown, type DropdownItemProps, type DropdownProps } from "semantic-ui-react";
import { defaultCatch } from "../services/sonamu.shared";
import { SonamuUIService } from "../services/sonamu-ui.service";

type TableColumnAsyncSelectProps = {
  entityId: string;
  allowedTypes?: string[];
} & DropdownProps;
export function TableColumnAsyncSelect({
  entityId,
  allowedTypes,
  ...dropdownProps
}: TableColumnAsyncSelectProps) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);

  useEffect(() => {
    SonamuUIService.getTableColumns(entityId)
      .then(({ columns }) => {
        const filteredColumns = allowedTypes
          ? columns.filter((c) => allowedTypes.includes(c.type))
          : columns;

        setOptions(
          filteredColumns.map((c) => ({
            key: c.name,
            value: c.name,
            text: c.name,
          })),
        );
      })
      .catch(defaultCatch);
  }, [entityId, allowedTypes]);

  return (
    <Dropdown
      placeholder="Columns"
      multiple
      search
      selection
      options={options}
      {...dropdownProps}
    />
  );
}
