import { Button } from "semantic-ui-react";
import { type ButtonProps } from "semantic-ui-react";

export function DelButton(props: ButtonProps) {
  return <Button icon="trash" size="tiny" color="red" {...props}></Button>;
}
