import assert from "assert";

import { type Knex } from "knex";

import { err, ok } from "../core/result";
import { type Result } from "../core/result";

export type OnSubscribed = (result: Result<string | null>) => void | Promise<void>;

interface PostgresNotification {
  channel: string;
  payload?: string | null;
}

interface PostgresConnection {
  on(event: "close", listener: () => Promise<void>): void;
  on(event: "notification", listener: (message: PostgresNotification) => Promise<void>): void;
  on(event: "error", listener: (error: Error) => Promise<void>): void;
  off(event: "close", listener: () => Promise<void>): void;
  off(event: "notification", listener: (message: PostgresNotification) => Promise<void>): void;
  off(event: "error", listener: (error: Error) => Promise<void>): void;
  query(command: string): void;
}

export class PostgresPubSub {
  private isDestroyed = false;
  private isConnecting = false;
  private onClosed: () => Promise<void>;
  private onNotification: (message: PostgresNotification) => Promise<void>;
  private onError: (error: Error) => Promise<void>;
  private listeners = new Map<string, Set<OnSubscribed>>();

  private connection: PostgresConnection | null = null;

  private constructor(private readonly knex: Knex) {
    // Re-connect to the database when the connection is closed and not destroyed manually
    this.onClosed = async () => {
      if (this.isDestroyed) {
        return;
      }

      await this.connect();
    };

    this.onNotification = async ({ channel, payload: rawPayload }: PostgresNotification) => {
      const payload = rawPayload && rawPayload.length !== 0 ? rawPayload : null;
      const listeners = this.listeners.get(channel);
      if (!listeners) {
        return;
      }

      const result = ok(payload);
      await Promise.allSettled(
        Array.from(listeners.values()).map((listener) => Promise.resolve(listener(result))),
      );
    };

    this.onError = async (error: Error) => {
      const result = err(error);
      await Promise.allSettled(
        Array.from(this.listeners.values())
          .flatMap((listeners) => Array.from(listeners))
          .map((listener) => Promise.resolve(listener(result))),
      );
    };
  }

  get destroyed() {
    return this.isDestroyed;
  }

  // acquire new raw connection and set up listeners
  async connect() {
    // 동시 재연결 시도로 인한 연결 누수를 방지합니다.
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const connection = await this.knex.client.acquireRawConnection();
      connection.on("close", this.onClosed);
      connection.on("notification", this.onNotification);
      connection.on("error", this.onError);

      for (const channel of this.listeners.keys()) {
        connection.query(`LISTEN ${channel}`);
      }

      this.connection = connection;
    } finally {
      this.isConnecting = false;
    }
  }

  // destroy the listener and close the connection, do not destroy the knex connection
  async destroy() {
    if (this.isDestroyed) {
      return;
    }
    try {
      const connection = this.connection;
      if (connection) {
        connection.off("close", this.onClosed);
        connection.off("notification", this.onNotification);
        connection.off("error", this.onError);
        await this.knex.client.destroyRawConnection(connection);
      }
    } finally {
      this.isDestroyed = true;
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
    if (!this.listeners.has(channel)) {
      this.connection?.query(`LISTEN ${channel}`);
      this.listeners.set(channel, new Set<OnSubscribed>().add(callback));
      return;
    }

    const listeners = this.listeners.get(channel);
    assert(listeners, "Listener channel not found");
    listeners.add(callback);
  }
}
