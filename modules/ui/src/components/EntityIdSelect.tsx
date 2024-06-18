import { DropdownProps, Dropdown } from "semantic-ui-react";
import { SonamuUIService } from "../services/sonamu-ui.service";

export function EntityIdSelect(props: DropdownProps) {
  const { data, isLoading } = SonamuUIService.useEntities();
  const { entities } = data ?? {};
  const entityIds = entities?.map((entity) => entity.id);

  return (
    <>
      <Dropdown
        placeholder="EntityId"
        selection
        options={(entityIds ?? []).map((id) => ({
          key: id,
          value: id,
          text: id,
        }))}
        disabled={!entityIds}
        loading={isLoading}
        {...props}
      />
    </>
  );
}
