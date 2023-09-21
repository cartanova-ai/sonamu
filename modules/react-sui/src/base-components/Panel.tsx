import React, { ReactNode, HTMLAttributes } from "react";
import {
  Header,
  Grid,
  HeaderProps,
  Segment,
  SegmentProps,
} from "semantic-ui-react";
import classnames from "classnames";

type PanelProps = {
  title?: string;
  headerProps?: HeaderProps;
  buttons?: ReactNode;
} & SegmentProps;
export function Panel({
  title,
  headerProps,
  buttons,
  children,
  style,
  className,
  ...segmentProps
}: PanelProps) {
  const hasHeader = !!(title || buttons);
  return (
    <Segment
      basic
      className={classnames("panel", className)}
      style={style}
      {...segmentProps}
    >
      {hasHeader && (
        <div className="panel-header">
          <Header {...headerProps}>{title}</Header>
          {buttons && <div className="panel-buttons">{buttons}</div>}
        </div>
      )}
      <div className="panel-content">{children}</div>
    </Segment>
  );
}
