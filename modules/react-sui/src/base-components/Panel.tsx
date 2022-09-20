import classNames from 'classnames';
import React, { ReactNode } from 'react';
import {
  Segment,
  Header,
  Divider,
  SemanticCOLORS,
  SemanticTEXTALIGNMENTS,
  HeaderProps,
  Grid,
} from 'semantic-ui-react';

type PanelProps = {
  title: string;
  headerProps?: HeaderProps;
  buttons?: ReactNode;
  children?: ReactNode;
  noMargin?: boolean;
};
export function Panel({
  title,
  headerProps,
  buttons,
  children,
  noMargin,
}: PanelProps) {
  return (
    <div className="panel" style={{ margin: noMargin ? 0 : undefined }}>
      <Grid>
        <Grid.Row columns="equal">
          <Grid.Column verticalAlign="middle">
            <Header {...headerProps}>{title}</Header>
          </Grid.Column>
          <Grid.Column textAlign="right">{buttons}</Grid.Column>
        </Grid.Row>
        <Grid.Row>
          <Grid.Column>{children}</Grid.Column>
        </Grid.Row>
      </Grid>
    </div>
  );
}
