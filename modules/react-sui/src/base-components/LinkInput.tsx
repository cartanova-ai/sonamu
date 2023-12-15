import { isNil } from "lodash";
import { InputProps, Input, Button } from "semantic-ui-react";

export function LinkInput(
  props: InputProps & {
    handleButtonClick?: (
      e: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => void;
    onChange?: (
      event: React.ChangeEvent<HTMLInputElement>,
      data: { value: string | null }
    ) => void;
  }
) {
  const handleButtonClick =
    props.handleButtonClick ??
    ((_e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      if (isValidUrl(props.value)) {
        window.open(props.value);
      }
    });

  const isValidUrl = (someString: string | undefined | null) => {
    if (isNil(someString)) {
      return false;
    }

    try {
      new URL(someString);
      return true;
    } catch (_) {
      return false;
    }
  };

  return (
    <Input
      {...props}
      label={
        <Button onClick={handleButtonClick} disabled={!isValidUrl(props.value)}>
          열기
        </Button>
      }
      labelPosition="right"
      value={isNil(props.value) ? "" : props.value}
      onChange={(e, data) => {
        if (props.onChange) {
          return props.onChange(e, {
            ...data,
            value: data.value === "" ? null : data.value,
          });
        }
      }}
    />
  );
}
