export type LifecycleValue = object | string | number | boolean | null | undefined;

export interface LifecycleResource {
  init: () => LifecycleValue | Promise<LifecycleValue>;
  destroy: () => void | Promise<void>;
}

export type LifecycleResources = Record<string, LifecycleResource>;

export interface LifecyclePolicy<ResourceName extends string = string> {
  resources: readonly ResourceName[];
}

export const COMMAND_LIFECYCLE_POLICIES = {
  "entity.list": { resources: ["sonamu"] },
  "entity.show": { resources: ["sonamu"] },
  "entity.search": { resources: ["sonamu"] },
  "entity.apply": { resources: ["sonamu"] },
  "fixture.init": { resources: ["sonamu", "fixture"] },
  "fixture.import": { resources: ["sonamu", "fixture"] },
  "fixture.sync": { resources: ["sonamu", "fixture"] },
  "fixture.gen": { resources: ["sonamu", "fixture"] },
  "fixture.fetch": { resources: ["sonamu", "fixture"] },
  "fixture.explore": { resources: ["sonamu", "fixture"] },
  "migrate.run": { resources: ["sonamu"] },
  "migrate.apply": { resources: ["sonamu"] },
  "migrate.generate": { resources: ["sonamu"] },
  "migrate.status": { resources: ["sonamu"] },
  "migrate.connections": { resources: ["sonamu"] },
  "migrate.code": { resources: ["sonamu"] },
  "migrate.preview": { resources: ["sonamu"] },
  "migrate.shadow": { resources: ["sonamu"] },
  "migrate.rollback": { resources: ["sonamu"] },
  "stub.entity": { resources: ["sonamu"] },
  "stub.practice": { resources: ["sonamu"] },
  "scaffold.model": { resources: ["sonamu"] },
  "scaffold.model_test": { resources: ["sonamu"] },
  "scaffold.view_list": { resources: ["sonamu"] },
  "scaffold.view_form": { resources: ["sonamu"] },
  "scaffold.status": { resources: ["sonamu"] },
  "scaffold.preview": { resources: ["sonamu"] },
  "scaffold.batch": { resources: ["sonamu"] },
  "cone.gen": { resources: ["sonamu"] },
  "build.all": { resources: [] },
  "build.api": { resources: [] },
  "build.web": { resources: [] },
  "dev.all": { resources: [] },
  "dev.api": { resources: [] },
  "dev.web": { resources: [] },
  sync: { resources: ["sonamu"] },
  start: { resources: [] },
  "i18n.list": { resources: ["sonamu"] },
  "i18n.check": { resources: ["sonamu"] },
  "i18n.import": { resources: ["sonamu"] },
  "i18n.export": { resources: ["sonamu"] },
  "i18n.create": { resources: ["sonamu"] },
  "i18n.update": { resources: ["sonamu"] },
  "i18n.delete": { resources: ["sonamu"] },
  "task.definitions": { resources: ["sonamu"] },
  "task.list": { resources: ["sonamu"] },
  "task.show": { resources: ["sonamu"] },
  "task.steps": { resources: ["sonamu"] },
  "task.watch": { resources: ["sonamu"] },
  "task.pause": { resources: ["sonamu"] },
  "task.resume": { resources: ["sonamu"] },
  "task.cancel": { resources: ["sonamu"] },
  "test.run": { resources: [] },
  "test.status": { resources: [] },
  "cdd.tree": { resources: ["sonamu"] },
  "cdd.read": { resources: ["sonamu"] },
  "cdd.rules": { resources: ["sonamu"] },
  "cdd.rule.show": { resources: ["sonamu"] },
  "cdd.rule.add": { resources: ["sonamu"] },
  "cdd.ac": { resources: ["sonamu"] },
  "auth.generate": { resources: ["sonamu"] },
  "auth.add-companions": { resources: ["sonamu"] },
  "skills.sync": { resources: [] },
} as const satisfies Record<string, LifecyclePolicy>;

export interface LifecycleManager<ResourceMap extends LifecycleResources> {
  run<Result>(
    resourceNames: readonly (keyof ResourceMap & string)[],
    action: () => Result | Promise<Result>,
  ): Promise<Result>;
}

export interface LifecycleManagerOptions<ResourceMap extends LifecycleResources> {
  resources: ResourceMap;
}

export function createLifecycleManager<ResourceMap extends LifecycleResources>(
  options: LifecycleManagerOptions<ResourceMap>,
): LifecycleManager<ResourceMap> {
  return {
    async run(resourceNames, action) {
      const initialized: LifecycleResource[] = [];
      const visited = new Set<keyof ResourceMap & string>();
      let outcome:
        | { ok: true; value: Awaited<ReturnType<typeof action>> }
        | { ok: false; error: Error };

      try {
        for (const name of resourceNames) {
          // 같은 자원 요청이 겹쳐도 초기화와 해제는 한 번씩만 수행합니다.
          if (visited.has(name)) continue;
          visited.add(name);

          const resource = options.resources[name];
          if (resource === undefined) throw new Error(`Unknown lifecycle resource: ${name}`);
          await resource.init();
          initialized.push(resource);
        }

        outcome = { ok: true, value: await action() };
      } catch (error) {
        outcome = {
          ok: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }

      const cleanupErrors: Error[] = [];
      for (const resource of initialized.toReversed()) {
        try {
          await resource.destroy();
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }

      if (!outcome.ok) throw outcome.error;
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, "Failed to destroy lifecycle resources");
      }

      return outcome.value;
    },
  };
}
