import { camelize } from "inflection";
import type { SyntheticEvent } from "react";
import { Button, Dropdown, type DropdownProps } from "semantic-ui-react";
import { defaultCatch } from "../services/sonamu.shared";
import { SonamuUIService } from "../services/sonamu-ui.service";

export function TypeIdAsyncSelect({
  filter,
  withAddEnumButton,
  ...props
}: DropdownProps & {
  filter?: "enums" | "types";
  withAddEnumButton?: {
    entityId: string;
    propName: string;
  };
}) {
  const { data, isLoading, refetch } = SonamuUIService.useTypeIds(filter);
  const { typeIds } = data ?? {};

  const promptAddEnum = () => {
    if (!withAddEnumButton) {
      return;
    }

    const defEnumId = `${withAddEnumButton.entityId}${camelize(withAddEnumButton.propName)}`;
    const newEnumId = prompt("New Enum ID", defEnumId);
    if (!newEnumId) {
      return;
    }

    const { entityId } = withAddEnumButton;
    SonamuUIService.createEnumId({
      entityId,
      newEnumId,
    })
      .then(() => {
        refetch();
        setTimeout(() => {
          if (props.onChange) {
            props.onChange({} as SyntheticEvent<HTMLElement, Event>, {
              value: newEnumId,
            });
          }
        }, 100);
      })
      .catch(defaultCatch);
  };

  return (
    <>
      <Dropdown
        placeholder="TypeId"
        selection
        options={(typeIds ?? []).map((typeId) => ({
          key: typeId,
          value: typeId,
          text: typeId,
        }))}
        disabled={!typeIds}
        loading={isLoading}
        selectOnBlur={false}
        {...props}
      />
      <Button icon="refresh" size="mini" onClick={() => refetch()} />
      {withAddEnumButton && <Button icon="plus" size="mini" onClick={() => promptAddEnum()} />}
    </>
  );
}
