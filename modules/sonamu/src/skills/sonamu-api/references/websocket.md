# @websocket — Bidirectional Channel

The decorator declares both event directions; the connection arrives as the method's `WebSocketContext`
parameter.

```typescript
import { Sonamu, websocket, type WebSocketContext } from "sonamu";

import { ChatInEvents, ChatOutEvents } from "./chat.types";

@websocket({
  namespace: "chat",
  heartbeat: 30_000,
  guards: ["user"],
  outEvents: ChatOutEvents,
  inEvents: ChatInEvents,
})
async subscribeChat(ctx: WebSocketContext<ChatOutEvents, ChatInEvents>): Promise<void> {
  const user = ctx.user;
  if (!user) throw new Error("unauthenticated");

  ctx.ws.join("global");
  ctx.ws.setUserId(user.id);

  ctx.ws.onMessage("send", async ({ content }) => {
    Sonamu.websocketRuntime.publishToRoom("global", "newMessage", buildMessage(user, content), "chat");
  });

  ctx.ws.onClose(() => ctx.ws.leave("global"));

  await ctx.ws.waitForClose();
}
```

`@fastify/websocket` registers only when `server.plugins.ws` is set in `sonamu.config.ts`. The
generated project template leaves it out, so a first `@websocket` endpoint in a project usually needs
it added — `ws: true`, or `ws: { options: { maxPayload: 64 * 1024 } }` to pass transport options.

| Option        | Description                                                    | Required |
| ------------- | -------------------------------------------------------------- | -------- |
| `outEvents`   | Server→client events as a Zod object                           | Yes      |
| `inEvents`    | Client→server events as a Zod object                           | Yes      |
| `namespace`   | Groups connections for broadcasting; defaults to `"default"`     | -        |
| `heartbeat`   | Ping interval in ms, default `30000`; `0` or less disables it   | -        |
| `guards`      | Authentication/authorization guards                            | -        |
| `path`        | Custom path                                                    | -        |
| `resourceName`| Renames the generated hook                                     | -        |
| `description` | API documentation description                                  | -        |

Both event objects follow the same convention as `@stream` — declared as a Zod object and re-exported
as a same-named inferred type, so the value parameterizes the decorator while the type parameterizes
`WebSocketContext` and the generated hook.

```typescript
export const ChatOutEvents = z.object({
  newMessage: ChatMessage,
  typingUsers: z.array(ChatUser),
});
export type ChatOutEvents = z.infer<typeof ChatOutEvents>;
```

## Parameters come from the query string only

The route is a GET upgrade, so parameters are parsed from `request.query` and nothing else. A
parameter that cannot survive a query round trip will not arrive.

Calling the path with a plain HTTP GET — no `Upgrade` header — gets a 426 with `upgrade: websocket`
rather than a route miss:

```
426 { "message": "WebSocket upgrade required" }
```

In local development, `server.plugins.ws` being set moves Vite's HMR socket to its own port (24678,
or `SONAMU_VITE_HMR_PORT`) so the two WebSocket servers do not fight over the HTTP server. The
condition is the plugin config, not the routes: `ws` set with no `@websocket` route still splits the
port, and a `@websocket` route without `ws` does not — but that route has no plugin to serve it
either.

## WebSocketContext

`WebSocketContext<TOut, TIn>` is not `Context`. It shares `request`, `headers`, `locale`, `user`,
`session`, and `naiteStore`, but its `transport` is `"ws"` and it carries `ws` instead of `reply`,
`createSSE`, and the upload arrays.

Touching `reply` throws, because the WS path has no reply to mutate:

```
FastifyReply is not available in websocket context. Define websocketContextProvider if your context
setup depends on reply mutation.
```

That is the case for a project whose `contextProvider` writes to `reply` — it needs a separate
`websocketContextProvider` in `sonamu.config.ts`.

Guards run after the context is built and before the connection is activated, so a guard can read
`ctx.user` while a rejected connection is never visible to broadcasts.

## ctx.ws

| Member                   | Behaviour                                                            |
| ------------------------ | -------------------------------------------------------------------- |
| `publish(event, data)`   | Sends one `{event, data}` frame to this client                        |
| `onMessage(event, cb)`   | Registers an inbound handler; multiple handlers per event run in order |
| `onClose(cb)`            | Fires once on disconnect                                             |
| `waitForClose()`         | Resolves when the connection closes                                  |
| `join(roomId)` / `leave(roomId)` | Room membership within this namespace                        |
| `setUserId(id)` / `clearUserId()` | Binds the connection to a user for `publishToUser`          |
| `close(code?, reason?)`  | Closes from the server side                                          |
| `closed` / `id` / `userId` / `namespace` | Connection state                                     |

`publish` validates the payload against `outEvents` and throws on an unknown event name or a payload
that fails the schema:

```
Unknown websocket event: newMessag
Invalid websocket event payload: newMessage
```

On a closed connection it silently returns instead of throwing.

Inbound messages are validated too, and a failure closes the connection rather than being reported
back to the client — an unknown event name closes with 1008, a malformed envelope or a payload that
fails `inEvents` closes with 1007, and a handler that throws closes with 1011. Handlers run
serialized per connection, so message order inside one connection is preserved.

Messages that arrive before their `onMessage` handler is registered are buffered (up to 100, oldest
dropped) and flushed when the handler registers. Registering handlers before the first `await` avoids
depending on that buffer.

### Returning vs. waiting

Returning from the method does not close the connection — registered handlers keep firing and the
socket stays open. `await ctx.ws.waitForClose()` keeps the handler frame alive for the connection's
lifetime, which is what lets local state in the method body back the `onMessage` closures, and lets
cleanup code sit after the await.

## Publishing from outside the handler

`Sonamu.websocketRuntime` reaches connections that the current call stack does not own — a Model
method, a task, another connection's `onMessage`:

| Method                                              | Target                             |
| --------------------------------------------------- | ---------------------------------- |
| `broadcast(event, data, namespace?)`                | Every active connection            |
| `publishToRoom(roomId, event, data, namespace?)`    | Members of one room                |
| `publishToUser(userId, event, data, namespace?)`    | Every connection bound to that user |
| `publishToAudience(audience, event, data)`          | A `WebSocketAudience` spec         |

Rooms and user bindings are keyed per namespace. Passing the namespace scopes delivery to it; omitting
it delivers to that room or user id in **every** namespace, so a shared room name like `"global"`
across two namespaces will cross over.

These calls are untyped — the event name is a plain string and the data is `unknown`. Validation still
happens per connection at send time, and a connection whose payload fails validation is closed with
1011 while the rest of the fan-out proceeds.

`WebSocketAudience` composes targets:

```typescript
Sonamu.websocketRuntime.publishToAudience(
  WebSocketAudience.union(
    WebSocketAudience.room("global", "chat"),
    WebSocketAudience.user(adminId, "chat"),
  ),
  "newMessage",
  message,
);
```

Builders: `all(namespace?)`, `room(roomId, namespace?)`, `user(userId, namespace?)`,
`connections(connectionIds, namespace?)`, `union(...audiences)`.

## Generated hook

`@websocket` generates a hook named after the method (or `resourceName`), wrapping
`useWebSocketChannel`:

```typescript
const channel = ChatService.useSubscribeChat(
  {},
  {
    newMessage: (msg) => setMessages((prev) => [...prev, msg]),
    typingUsers: setTypingUsers,
  },
  { enabled: !!me },
);

channel.send("typing", { active: true });
```

- `handlers` covers `outEvents`; every key is optional, and only the registered ones get called.
- `send` is typed against `inEvents`. Calling it while disconnected sets `error` to
  `"WebSocket is not connected"` instead of throwing.
- The returned state is `{ isConnected, error, retryCount, readyState, send, close }`.
- `WebSocketChannelOptions` is `{ enabled?, retry?, retryInterval?, protocols?, traceProvider? }`,
  defaulting to enabled with 3 retries at 3s.
- Payloads are parsed with a date reviver, so ISO date strings arrive as `Date` objects.
- Reconnection is skipped for close codes the server uses to reject — 1000, 1002, 1003, 1007, 1008,
  1009 stop and surface an error. A guard rejection therefore fails fast instead of retrying three
  times.
