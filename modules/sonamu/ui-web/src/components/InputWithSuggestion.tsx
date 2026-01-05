import { Button, Input, type InputProps } from "@sonamu-kit/react-components";
import { useState } from "react";
import LanguagesIcon from "~icons/lucide/languages";
import { SonamuUIService } from "../services/sonamu-ui.service";

type InputWithSuggestionProps = {
  origin: string | undefined | null;
  entityId?: string;
} & InputProps;
export function InputWithSuggestion({ origin, entityId, ...inputProps }: InputWithSuggestionProps) {
  const [loading, setLoading] = useState(false);

  const triggerChange = (value: string) => {
    if (inputProps.onValueChange) {
      inputProps.onValueChange(value);
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
        onFocus={() => {
          if (inputProps.onValueChange && (inputProps.value ?? "") === "") {
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
