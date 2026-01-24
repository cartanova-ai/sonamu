import { Button, Input, type InputProps } from "@sonamu-kit/react-components";
import { useEffect, useState } from "react";
import LanguagesIcon from "~icons/lucide/languages";
import { SonamuUIService } from "../services/sonamu-ui.service";

type InputWithSuggestionProps = {
  origin: string | undefined | null;
  entityId?: string;
} & InputProps;
export function InputWithSuggestion({ origin, entityId, ...inputProps }: InputWithSuggestionProps) {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState<string>(
    inputProps.value === undefined || inputProps.value === null ? "" : String(inputProps.value),
  );

  useEffect(() => {
    const originValue =
      inputProps.value === undefined || inputProps.value === null ? "" : String(inputProps.value);
    if (value !== originValue) {
      setValue(originValue);
    }
  }, [inputProps.value]);

  const triggerChange = (newValue: string) => {
    setValue(newValue);
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
