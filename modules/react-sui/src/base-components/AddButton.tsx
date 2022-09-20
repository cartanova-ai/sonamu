import React from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonProps, Icon, SemanticICONS } from 'semantic-ui-react';

type AddButtonProps = ButtonProps & {
  currentRoute: string;
  icon: SemanticICONS;
  label: string;
};
export function AddButton({
  currentRoute,
  icon,
  label,
  ...props
}: AddButtonProps) {
  return (
    <Button
      color="blue"
      size="tiny"
      as={Link}
      to={`${currentRoute}/form`}
      state={{ from: currentRoute }}
      {...props}
    >
      <Icon name={icon} />
      {label}
    </Button>
  );
}
