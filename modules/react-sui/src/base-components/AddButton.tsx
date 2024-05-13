import { Link } from "react-router-dom";
import { Button, ButtonProps } from "semantic-ui-react";

type AddButtonProps = ButtonProps & {
  currentRoute: string;
  label: string;
};
export function AddButton({ currentRoute, label, ...props }: AddButtonProps) {
  return (
    <Button
      color="blue"
      size="tiny"
      as={Link}
      to={
        `${currentRoute.split("?")[0]}/form` +
        (currentRoute.includes("?") ? "?" + currentRoute.split("?")[1] : "")
      }
      state={{ from: currentRoute }}
      content={label}
      {...props}
    ></Button>
  );
}
