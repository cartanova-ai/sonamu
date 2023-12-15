import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Breadcrumb } from "semantic-ui-react";

type AppBreadcrumbsProps = {
  children?: ReactNode;
};
export function AppBreadcrumbs({ children }: AppBreadcrumbsProps) {
  return (
    <div className="breadcrumb">
      <Breadcrumb size="tiny">
        <Breadcrumb.Section link as={Link} to="/">
          Home
        </Breadcrumb.Section>
        {children && <Breadcrumb.Divider />}
        {children}
      </Breadcrumb>
    </div>
  );
}
