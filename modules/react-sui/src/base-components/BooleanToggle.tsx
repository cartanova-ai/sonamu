import React, { FormEvent } from 'react';
import { CheckboxProps, Checkbox } from 'semantic-ui-react';

export function BooleanToggle(
  props: Omit<CheckboxProps, 'value'> & {
    onChange?: (
      event: FormEvent<HTMLInputElement>,
      data: { value: boolean },
    ) => void;
  } & {
    value: boolean;
  },
) {
  return (
    <Checkbox
      toggle
      {...props}
      value={props.value ? '1' : '0'}
      checked={!!props.value}
      onChange={(e, data) => {
        if (props.onChange) {
          return props.onChange(e, {
            ...data,
            value: !!data.checked,
          });
        }
      }}
    />
  );
}
