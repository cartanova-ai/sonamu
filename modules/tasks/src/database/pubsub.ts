import assert from "assert";

import type { Knex } from "knex";

import { err, ok } from "../core/result";
import type { Result } from "../core/result";

export type OnSubscribed = (result: Result<string | null>) => void | Promise<void>;

export class PostgresPubSub {
  private _destroyed = false;
  private _connecting = false;
  private _onClosed: () => Promise<void>;
  private _onNotification: (msg: { channel: string; payload: unknown }) => Promise<void>;
  private _onError: (error: Error) => Promise<void>;
  private _listeners = new Map<string, Set<OnSubscribed>>();

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Knex exposes a connection as any
  private _connection: any | null = null;

  private constructor(private readonly knex: Knex) {
    // Re-connect to the database when the connection is closed and not destroyed manually
    this._onClosed = (async () => {
      if (this._destroyed) {
        return;
      }

      await this.connect();
    }).bind(this);

    this._onNotification = (async ({
      channel,
      payload: rawPayload,
    }: {
      channel: string;
      payload: unknown;
    }) => {
      const payload = typeof rawPayload === "string" && rawPayload.length !== 0 ? rawPayload : null;
      const listeners = this._listeners.get(channel);
      if (!listeners) {
        return;
      }

      const result = ok(payload);
      await Promise.allSettled(
        Array.from(listeners.values()).map((listener) => Promise.resolve(listener(result))),
      );
    }).bind(this);

    this._onError = (async (error: Error) => {
      const result = err(error);
      await Promise.allSettled(
        Array.from(this._listeners.values())
          .flatMap((listeners) => Array.from(listeners))
          .map((listener) => Promise.resolve(listener(result))),
      );
    }).bind(this);
  }

  get destroyed() {
    return this._destroyed;
  }

  // acquire new raw connection and set up listeners
  async connect() {
    // 동시 재연결 시도로 인한 연결 누수를 방지합니다.
    if (this._connecting) return;
    this._connecting = true;

    try {
      const connection = await this.knex.client.acquireRawConnection();
      connection.on("close", this._onClosed);
      connection.on("notification", this._onNotification);
      connection.on("error", this._onError);

      for (const channel of this._listeners.keys()) {
        connection.query(`LISTEN ${channel}`);
      }

      this._connection = connection;
    } finally {
      this._connecting = false;
    }
  }

  // destroy the listener and close the connection, do not destroy the knex connection
  async destroy() {
    if (this._destroyed) {
      return;
    }
    try {
      this._connection.off("close", this._onClosed);
      this._connection.off("notification", this._onNotification);
      this._connection.off("error", this._onError);
      await this.knex.client.destroyRawConnection(this._connection);
    } finally {
      this._destroyed = true;
    }
  }

  // create a new listener and connect to the database
  static async create(knex: Knex) {
    const listener = new PostgresPubSub(knex);
    await listener.connect();
    return listener;
  }

  // add a new listener to the channel
  listenEvent(channel: string, callback: OnSubscribed) {
    if (!this._listeners.has(channel)) {
      this._connection?.query(`LISTEN ${channel}`);
      this._listeners.set(channel, new Set<OnSubscribed>().add(callback));
      return;
    }

    const listeners = this._listeners.get(channel);
    assert(listeners, "Listener channel not found");
    listeners.add(callback);
  }
}
