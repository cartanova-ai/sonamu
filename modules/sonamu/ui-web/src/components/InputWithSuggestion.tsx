import { Button, Input } from "@sonamu-kit/react-components";
import { type InputProps } from "@sonamu-kit/react-components";
import { useState } from "react";
import LanguagesIcon from "~icons/lucide/languages";

import { SonamuUIService } from "../services/sonamu-ui.service";

type InputWithSuggestionProps = {
  origin: string | undefined | null;
  entityId?: string;
} & InputProps;
export function InputWithSuggestion({ origin, entityId, ...inputProps }: InputWithSuggestionProps) {
  const [loading, setLoading] = useState(false);
  const originValue =
    inputProps.value === undefined || inputProps.value === null ? "" : String(inputProps.value);
  const [editedValue, setEditedValue] = useState<{ origin: string; value: string }>();
  const value = editedValue?.origin === originValue ? editedValue.value : originValue;

  const triggerChange = (newValue: string) => {
    setEditedValue({ origin: originValue, value: newValue });
    if (inputProps.onValueChange) {
      inputProps.onValueChange(newValue);
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
    <div className="flex gap-2">
      <Input
        {...inputProps}
        value={value}
        onValueChange={triggerChange}
        onFocus={() => {
          if (inputProps.onValueChange && value === "") {
            triggerChangeToSuggestion();
          }
        }}
      />
      <Button
        variant="default"
        onClick={() => triggerChangeToSuggestion()}
        disabled={loading}
        className="shrink-0"
      >
        <LanguagesIcon />
      </Button>
    </div>
  );
}
