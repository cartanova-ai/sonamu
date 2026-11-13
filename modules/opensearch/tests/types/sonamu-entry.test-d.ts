import { type Knex } from "knex";
import { type PuriTransactionWrapper, type SonamuConfig } from "sonamu";
import { describe, expectTypeOf, it } from "vitest";

import type * as Root from "../../src";
import { type SearchClient, type SearchClientOptions } from "../../src";
import type * as Admin from "../../src/admin";
import {
  type IndexerEvent,
  type MarkChangedResult,
  type PostgresSynchronization,
  type SearchSynchronization,
  type StopReport,
  type WorkerHandle,
  type WorkerLimits,
  type WorkerStatus,
} from "../../src/postgres";
import type * as Postgres from "../../src/postgres";
// Type test files never run, so this value import has no runtime effect.
import * as SonamuEntry from "../../src/sonamu";
import {
  type SearchLifecycle,
  type SearchLifecycleError,
  type SearchLifecycleOptions,
  type SearchLifecycleState,
  type SearchLifecycleStatus,
  type SearchLifecycleWorkerOptions,
  type SearchResourceContainer,
  type SonamuSearchSynchronization,
} from "../../src/sonamu";
import type * as Testing from "../../src/testing";

// sonamu is an optional peer, so no other entry point may re-export ./sonamu. The runtime import boundary is
// enforced by tests/unit/dependency-graph.test.ts.

declare const lifecycle: SearchLifecycle;
declare const container: SearchResourceContainer;
declare const synchronization: PostgresSynchronization;
declare const client: SearchClient;
declare const clientOptions: SearchClientOptions;
declare const limits: WorkerLimits;

// The server.lifecycle hooks of sonamu.config.ts.
type SonamuLifecycleHooks = NonNullable<SonamuConfig["server"]["lifecycle"]>;

type SonamuValueExports =
  | "createSearchLifecycle"
  | "createSonamuSearchQueries"
  | "createSonamuSynchronization"
  | "defineSonamuSearch"
  | "getSearchLifecycleStatus"
  | "getSearchResourceContainer"
  | "resolveSonamuPrimary"
  | "withProjectionScope";

describe("./sonamu 진입점", () => {
  it("값 export는 정해진 여덟 개다", () => {
    expectTypeOf<keyof typeof SonamuEntry>().toEqualTypeOf<SonamuValueExports>();
  });

  it("다른 진입점은 ./sonamu의 export를 내보내지 않는다 (sonamu는 선택적 peer)", () => {
    expectTypeOf<Extract<keyof typeof Root, SonamuValueExports>>().toBeNever();
    expectTypeOf<Extract<keyof typeof Postgres, SonamuValueExports>>().toBeNever();
    expectTypeOf<Extract<keyof typeof Admin, SonamuValueExports>>().toBeNever();
    expectTypeOf<Extract<keyof typeof Testing, SonamuValueExports>>().toBeNever();
  });

  it("동기화, primary, projection 스코프, 정의 함수의 시그니처", () => {
    expectTypeOf(SonamuEntry.resolveSonamuPrimary).toEqualTypeOf<() => Knex>();
    expectTypeOf(SonamuEntry.withProjectionScope).toEqualTypeOf<
      <T>(trx: Knex.Transaction, callback: () => Promise<T>) => Promise<T>
    >();
    expectTypeOf(SonamuEntry.createSonamuSynchronization).toEqualTypeOf<
      (synchronization: SearchSynchronization) => SonamuSearchSynchronization
    >();
    expectTypeOf<SonamuSearchSynchronization["markChangedIn"]>()
      .parameter(0)
      .toEqualTypeOf<PuriTransactionWrapper>();
    expectTypeOf<SonamuSearchSynchronization["markChanged"]>().returns.toEqualTypeOf<
      Promise<MarkChangedResult>
    >();
    expectTypeOf(SonamuEntry.defineSonamuSearch<{ body: string }>)
      .parameter(0)
      .toEqualTypeOf<Root.SearchDefinition<{ body: string }>>();
    expectTypeOf(SonamuEntry.defineSonamuSearch<{ body: string }>).returns.toEqualTypeOf<
      Root.DefinedSearch<{ body: string }>
    >();
  });

  it("createSearchLifecycle과 SearchLifecycle", () => {
    expectTypeOf(SonamuEntry.createSearchLifecycle).toEqualTypeOf<
      (options: SearchLifecycleOptions) => SearchLifecycle
    >();
    expectTypeOf(lifecycle.onStart).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(lifecycle.onShutdown).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(lifecycle.handle).toEqualTypeOf<() => WorkerHandle | undefined>();
    expectTypeOf(lifecycle.status).returns.toEqualTypeOf<SearchLifecycleStatus>();
    // Assignable to Sonamu's server.lifecycle hooks as they are.
    expectTypeOf(lifecycle.onStart).toExtend<NonNullable<SonamuLifecycleHooks["onStart"]>>();
    expectTypeOf(lifecycle.onShutdown).toExtend<NonNullable<SonamuLifecycleHooks["onShutdown"]>>();

    expectTypeOf<SearchLifecycleStatus>().toEqualTypeOf<{
      readonly name: string;
      readonly state: SearchLifecycleState;
      readonly generation: number | undefined;
      readonly latestGeneration: number;
      readonly initialized: boolean;
      readonly worker: WorkerStatus | undefined;
      readonly lastStop: StopReport | undefined;
      readonly lastError: SearchLifecycleError | undefined;
    }>();
    expectTypeOf<SearchLifecycleState>().toEqualTypeOf<
      "idle" | "starting" | "running" | "degraded" | "failed" | "stopping" | "stopped"
    >();
  });

  it("옵션: 슬롯 이름은 필수이고, 워커를 돌릴지와 워커 클라이언트 소유는 명시한다", () => {
    expectTypeOf<SearchLifecycleOptions>().toEqualTypeOf<{
      readonly name: string;
      readonly synchronization?: PostgresSynchronization;
      readonly worker?: SearchLifecycleWorkerOptions;
      readonly clients?: readonly SearchClient[];
      readonly stopDeadlineMs: number;
      readonly initializeRetry?: { readonly baseDelayMs: number; readonly maxDelayMs: number };
    }>();
    expectTypeOf<SearchLifecycleWorkerOptions>().toEqualTypeOf<{
      readonly enabled: boolean;
      readonly client: SearchClientOptions;
      readonly definitions: readonly Root.DefinedSearch[];
      readonly limits: WorkerLimits;
      readonly pollIntervalMs: number;
      readonly workerId?: string;
      readonly onEvent?: (event: IndexerEvent) => void;
    }>();

    const worker: SearchLifecycleWorkerOptions = {
      enabled: true,
      client: clientOptions,
      definitions: [],
      limits,
      pollIntervalMs: 1_000,
    };
    SonamuEntry.createSearchLifecycle({ name: "app", synchronization, worker, stopDeadlineMs: 1 });
    SonamuEntry.createSearchLifecycle({ name: "api", clients: [client], stopDeadlineMs: 1 });

    // @ts-expect-error -- the HMR slot name is never inferred
    SonamuEntry.createSearchLifecycle({ synchronization, worker, stopDeadlineMs: 1 });
    const { enabled: _enabled, ...withoutEnabled } = worker;
    SonamuEntry.createSearchLifecycle({
      name: "app",
      // @ts-expect-error -- enabled must be explicit
      worker: withoutEnabled,
      stopDeadlineMs: 1,
    });
    SonamuEntry.createSearchLifecycle({
      name: "app",
      // @ts-expect-error -- the worker takes client options, not a wrapper it would close on stop
      worker: { ...worker, client },
      stopDeadlineMs: 1,
    });
    SonamuEntry.createSearchLifecycle({
      name: "app",
      worker: {
        ...worker,
        // @ts-expect-error -- ownsClient must be explicit
        client: { createClient: clientOptions.createClient, requestTimeoutMs: 1_000 },
      },
      stopDeadlineMs: 1,
    });
  });

  it("리소스 컨테이너", () => {
    expectTypeOf(SonamuEntry.getSearchResourceContainer).toEqualTypeOf<
      (scope?: string) => SearchResourceContainer
    >();
    expectTypeOf(
      container.replace(
        "loop",
        () => 1,
        async (value) => {
          expectTypeOf(value).toEqualTypeOf<number>();
        },
      ),
    ).toEqualTypeOf<Promise<number>>();
    expectTypeOf(
      container.replace(
        "timer",
        async () => "x",
        async () => {},
      ),
    ).toEqualTypeOf<Promise<string>>();
    expectTypeOf(container.disposeAll).toEqualTypeOf<() => Promise<void>>();
  });
});
