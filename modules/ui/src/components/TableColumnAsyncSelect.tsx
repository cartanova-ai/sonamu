import { useEffect, useState } from "react";
import { Dropdown, DropdownItemProps, DropdownProps } from "semantic-ui-react";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";

type TableColumnAsyncSelectProps = {
  entityId: string;
} & DropdownProps;
export function TableColumnAsyncSelect({
  entityId,
  ...dropdownProps
}: TableColumnAsyncSelectProps) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);

  useEffect(() => {
    SonamuUIService.getTableColumns(entityId)
      .then(({ columns }) => {
        setOptions(
          columns.map((c) => ({
            key: c,
            value: c,
            text: c,
          }))
        );
      })
      .catch(defaultCatch);
  }, [entityId]);

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
