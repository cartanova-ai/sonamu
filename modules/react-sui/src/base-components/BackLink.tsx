import React from "react";
import { Button, ButtonProps } from "semantic-ui-react";
import { useGoBack } from "../helpers/helpers";

type BackLinkProps = ButtonProps & { to: string };
export function BackLink({ to, ...props }: BackLinkProps) {
  const { goBack } = useGoBack();

  const handleClick = () => {
    goBack(to);
  };
  return (
    <Button {...props} onClick={handleClick}>
      {props.children}
    </Button>
  );
}
