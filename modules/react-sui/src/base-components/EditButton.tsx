import React from 'react';
import { Button, ButtonProps } from 'semantic-ui-react';

export function EditButton(props: ButtonProps) {
  return <Button icon="edit" size="tiny" color="yellow" {...props}></Button>;
}
