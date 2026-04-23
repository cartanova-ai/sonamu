import { Button, Input } from "semantic-ui-react";
import { type InputProps } from "semantic-ui-react";

function isValidUrl(someString: string | undefined | null): boolean {
  if (someString === null || someString === undefined) {
    return false;
  }

  return URL.canParse(someString);
}

export function LinkInput(
  props: InputProps & {
    handleButtonClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>, data: { value: string | null }) => void;
  },
) {
  const handleButtonClick =
    props.handleButtonClick ??
    ((_e: React.MouseEvent<HTMLButtonElement>) => {
      if (isValidUrl(props.value)) {
        window.open(props.value);
      }
    });

  return (
    <Input
      {...props}
      label={
        <Button onClick={handleButtonClick} disabled={!isValidUrl(props.value)}>
          열기
        </Button>
      }
      labelPosition="right"
      value={props.value ?? ""}
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
