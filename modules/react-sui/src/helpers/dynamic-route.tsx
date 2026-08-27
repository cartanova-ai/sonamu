import { last } from "radashi";
import React, { type ComponentType } from "react";
import { Route } from "react-router-dom";

type RouteModule = {
  default: ComponentType<any>;
};

type RouteModuleLoader = () => Promise<RouteModule>;

type RoutePage = {
  path: string;
  load: RouteModuleLoader;
};

type RouteNode = {
  children: Map<string, RouteNode>;
  page?: RoutePage;
};

function createRouteNode(): RouteNode {
  return { children: new Map() };
}

function renderRouteNode(node: RouteNode): React.ReactElement[] {
  return Array.from(node.children.entries()).map(([key, childNode]) => {
    if (childNode.page !== undefined) {
      const Page = React.lazy(childNode.page.load);
      const element = <Page />;

      return childNode.page.path === "index" ? (
        <Route key={key} index element={element} />
      ) : (
        <Route key={key} path={childNode.page.path} element={element} />
      );
    }

    return (
      <Route path={key} key={key}>
        {renderRouteNode(childNode)}
      </Route>
    );
  });
}

export function loadDynamicRoutes(
  modules: Record<string, RouteModuleLoader>,
): React.ReactElement[] {
  const root = createRouteNode();

  for (const [modulePath, load] of Object.entries(modules)) {
    const pathParts = modulePath
      .replace(/^\.\/pages\//, "")
      .replace(/\.tsx$/, "")
      .split("/");
    const routePath = last(pathParts);

    if (routePath === undefined || routePath.startsWith("_")) {
      continue;
    }

    let node = root;
    for (const pathPart of pathParts) {
      let childNode = node.children.get(pathPart);
      if (childNode === undefined) {
        childNode = createRouteNode();
        node.children.set(pathPart, childNode);
      }
      node = childNode;
    }

    node.page = { path: routePath, load };
  }

  return renderRouteNode(root);
}
