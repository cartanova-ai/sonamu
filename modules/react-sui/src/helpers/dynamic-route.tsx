import _ from "lodash";
import React, { ComponentType } from "react";
import { Route } from "react-router-dom";

type ModulePromise = () => Promise<{ default: ComponentType<any> }>;
type ModulesObject = {
  [key: string]:
    | ModulesObject
    | {
        path: string;
        module:
          | ModulePromise
          | Promise<{ default: ComponentType<any> }>
          | { default: ComponentType<any> };
      };
};

export function loadDynamicRoutes(
  modules: Record<string, () => unknown>
): JSX.Element[] {
  const keys = Object.keys(modules);

  const modulesObject = keys.reduce((result, key) => {
    const p = key
      .replace(/^\.\/pages\//, "")
      .replace(/\.tsx$/, "")
      .split("/");
    if ((_.last(p) ?? "").startsWith("_")) {
      return result;
    }
    return _.set(result, p, {
      path: _.last(p),
      module: modules[key],
    });
  }, {} as ModulesObject);

  const renderModulesObject = (obj: ModulesObject) => {
    return Object.entries(obj).map(([key, child]) => {
      if (
        child.hasOwnProperty("module") &&
        typeof child.module === "function"
      ) {
        const Page = React.lazy(child.module);
        const element = <Page />;

        const prop =
          child.path === "index"
            ? {
                index: true,
              }
            : {
                path: child.path,
              };
        return <Route key={key} {...prop} element={element} />;
      } else if (child.module && typeof child.module === "object") {
        const Page = (child.module as { default: ComponentType<any> }).default;
        const element = <Page />;

        const prop =
          child.path === "index"
            ? {
                index: true,
              }
            : {
                path: child.path,
              };
        return <Route key={key} {...prop} element={element} />;
      } else {
        return (
          <Route path={key} key={key}>
            {renderModulesObject(child as ModulesObject)}
          </Route>
        );
      }
    });
  };

  return renderModulesObject(modulesObject);
}
