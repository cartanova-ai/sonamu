import React from 'react';
import { Button, ButtonProps, SemanticCOLORS } from 'semantic-ui-react';

export type ButtonSetProps = {
  options?: {
    value: string | number;
    text: string;
  }[];
  value?: string | number | string[];
  onChange?: (e: any, prop: ButtonSetProps) => void;
  buttonProps?: ButtonProps;
  baseColor?: SemanticCOLORS;
  selectedColor?: SemanticCOLORS;
};
export function ButtonSet({
  options,
  value,
  onChange,
  buttonProps,
  selectedColor,
  baseColor,
}: ButtonSetProps) {
  selectedColor ??= 'grey';

  return (
    <div className="button-set-wrapper">
      {(options ?? []).map(({ value: _value, text }, index) => (
        <Button
          key={index}
          color={value === _value ? selectedColor : baseColor}
          active={value === _value}
          {...buttonProps}
          onClick={(e) => {
            if (onChange) {
              onChange(e, { value: _value });
            }
          }}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}
