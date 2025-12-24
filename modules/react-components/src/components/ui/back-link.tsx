import type React from "react";
import { useGoBack } from "../../lib/helpers";
import { Button } from "./button";

type BackLinkProps = React.ComponentProps<typeof Button> & { to: string };

export function BackLink({ to, children, ...props }: BackLinkProps) {
  const { goBack } = useGoBack();

  const handleClick = () => {
    goBack(to);
  };

  return (
    <Button {...props} onClick={handleClick}>
      {children}
    </Button>
  );
}
