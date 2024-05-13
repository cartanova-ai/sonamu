import { ChangeEvent, useState } from "react";
import { Button, FormInput, InputProps } from "semantic-ui-react";
import { SonamuUIService } from "../services/sonamu-ui.service";

type FormInputWithSuggestionProps = {
  origin: string | undefined | null;
  entityId?: string;
} & InputProps;
export function FormInputWithSuggestion({
  origin,
  entityId,
  ...inputProps
}: FormInputWithSuggestionProps) {
  const [loading, setLoading] = useState(false);

  const triggerChange = (value: string) => {
    if (inputProps.onChange) {
      inputProps.onChange({} as ChangeEvent<HTMLInputElement>, {
        value,
      });
    }
  };
  const triggerChangeToSuggestion = () => {
    if (!origin) {
      return;
    }

    setLoading(true);
    SonamuUIService.getSuggestion({ origin, entityId })
      .then(({ suggested }) => {
        triggerChange(suggested);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <FormInput
      {...inputProps}
      action={
        <Button
          color="pink"
          icon="translate"
          onClick={() => triggerChangeToSuggestion()}
          loading={loading}
        />
      }
      onFocus={() => {
        if (inputProps.onChange && (inputProps.value ?? "") === "") {
          triggerChangeToSuggestion();
        }
      }}
    />
  );
}
