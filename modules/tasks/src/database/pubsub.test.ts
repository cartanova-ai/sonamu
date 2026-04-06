import knex, { type Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Result } from "../core/result";
import { KNEX_GLOBAL_CONFIG } from "../testing/connection";
import { type OnSubscribed, PostgresPubSub } from "./pubsub";

describe("PostgresPubSub", () => {
  let knexInstance: Knex;

  beforeEach(async () => {
    knexInstance = knex(KNEX_GLOBAL_CONFIG);
  });

  afterEach(async () => {
    await knexInstance.destroy();
  });

  it("should create a new pubsub and connect to the database", async () => {
    const pubsub = await PostgresPubSub.create(knexInstance);
    expect(pubsub.destroyed).toBe(false);
  });

  it("should destroy the pubsub and close the connection", async () => {
    const pubsub = await PostgresPubSub.create(knexInstance);
    expect(pubsub.destroyed).toBe(false);
    await pubsub.destroy();
    expect(pubsub.destroyed).toBe(true);
  });

  it("should not add the same pubsub multiple times", async () => {
    const pubsub = await PostgresPubSub.create(knexInstance);
    const results: Result<string | null>[] = [];
    const callback: OnSubscribed = async (result) => {
      results.push(result);
    };

    pubsub.listenEvent("test", callback);
    pubsub.listenEvent("test", callback);

    await knexInstance.raw("NOTIFY test, 'test'");
    await sleep(100);

    expect(results.length).toBe(1);
    expect(results[0]).toStrictEqual({ ok: true, value: "test" });
  });

  it("should route notifications to the correct pubsubs by channel", async () => {
    const pubsub = await PostgresPubSub.create(knexInstance);
    const results1: Result<string | null>[] = [];
    const results2: Result<string | null>[] = [];

    pubsub.listenEvent("test1", (result) => {
      results1.push(result);
    });
    pubsub.listenEvent("test2", (result) => {
      results2.push(result);
    });

    await knexInstance.raw("NOTIFY test1, '!!!'");
    await sleep(100);

    expect(results1.length).toBe(1);
    expect(results1[0]).toStrictEqual({ ok: true, value: "!!!" });
    expect(results2.length).toBe(0);

    await knexInstance.raw("NOTIFY test2, '###'");
    await sleep(100);

    expect(results1.length).toBe(1);
    expect(results2.length).toBe(1);
    expect(results2[0]).toStrictEqual({ ok: true, value: "###" });
  });

  it("should payload be null if the payload is empty string", async () => {
    const pubsub = await PostgresPubSub.create(knexInstance);
    const results: Result<string | null>[] = [];
    const callback: OnSubscribed = async (result) => {
      results.push(result);
    };

    pubsub.listenEvent("test", callback);
    await knexInstance.raw(`NOTIFY test`);
    await sleep(100);

    expect(results.length).toBe(1);
    expect(results[0]).toStrictEqual({ ok: true, value: null });
  });
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
