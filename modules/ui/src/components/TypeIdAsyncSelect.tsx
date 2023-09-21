import { DropdownProps, Dropdown, Button } from "semantic-ui-react";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { SyntheticEvent } from "react";

export function TypeIdAsyncSelect({
  filter,
  withAddEnumButton,
  ...props
}: DropdownProps & {
  filter?: "enums" | "types";
  withAddEnumButton?: {
    entityId: string;
  };
}) {
  const { data, isLoading, mutate } = SonamuUIService.useTypeIds(filter);
  const { typeIds } = data ?? {};

  const promptAddEnum = () => {
    if (!withAddEnumButton) {
      return;
    }
    const newEnumId = prompt("New Enum ID");
    if (!newEnumId) {
      return;
    }

    const { entityId } = withAddEnumButton;
    SonamuUIService.createEnumId({
      entityId,
      newEnumId,
    })
      .then(() => {
        mutate();
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
      {withAddEnumButton && (
        <Button icon="plus" size="mini" onClick={() => promptAddEnum()} />
      )}
    </>
  );
}
