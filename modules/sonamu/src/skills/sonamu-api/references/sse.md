# @stream — Server-Sent Events

The decorator declares the event shape; the connection itself comes from the Context.

```typescript
import { Sonamu, stream } from "sonamu";

import { ProjectAskStreamEvents } from "./project.types";

@stream({ type: "sse", events: ProjectAskStreamEvents })
async ask(prompt: string): Promise<void> {
  const { createSSE } = Sonamu.getContext();
  const sse = createSSE(ProjectAskStreamEvents);

  try {
    for await (const token of somethingStreaming(prompt)) {
      sse.publish("onToken", { token });
    }
    sse.publish("onComplete", { fullText });
  } catch (error) {
    const cause = isError(error) ? error : new Error("Unknown error");
    sse.publish("onError", { error: { name: cause.name, message: cause.message } });
  }

  await sse.end();
}
```

| Option         | Description                                    | Required |
| -------------- | ---------------------------------------------- | -------- |
| `type`         | `"sse"` — the only transport currently supported | Yes    |
| `events`       | Event keys and payloads as a Zod object         | Yes      |
| `path`         | Custom path                                    | -        |
| `resourceName` | Renames the generated hook                     | -        |
| `guards`       | Authentication/authorization guards            | -        |
| `description`  | API documentation description                  | -        |

`publish` writes through `fastify-sse-v2`, which Sonamu registers only when `server.plugins.sse` is
set in `sonamu.config.ts`. The generated project template leaves it out, so a first `@stream`
endpoint in a project usually needs `sse: true` added there before it can send anything.

Errors thrown before the first `publish` still go through the normal HTTP error path, since the
response has not been committed yet — see `errors.md`.

## Event schema

The schema is declared once as a Zod object and re-exported as a same-named inferred type, so the
value can be passed to both the decorator and `createSSE` while the type parameterizes the client:

```typescript
// project.types.ts
export const ProjectAskStreamEvents = z.object({
  onToken: z.object({ token: z.string() }),
  onComplete: z.object({ fullText: z.string() }),
  onError: z.object({
    error: z.object({ name: z.string(), message: z.string() }),
  }),
});
export type ProjectAskStreamEvents = z.infer<typeof ProjectAskStreamEvents>;
```

`publish` is keyed to that object, so an unknown event name or a mismatched payload is a compile
error.

### Payloads must be JSON-serializable

`publish` sends `JSON.stringify(data)`, so only own enumerable properties survive. An `Error`
declared as `z.instanceof(Error)` — or an object schema an `Error` happens to satisfy structurally,
since `name`/`message`/`stack` are all declared on it — type-checks and then arrives at the client
as `{}`, because those properties are non-enumerable on `Error` instances. Declare the fields the
client needs and copy them across explicitly:

```typescript
// WRONG — client receives {}
sse.publish("onError", { error: caught });

// CORRECT
sse.publish("onError", { error: { name: caught.name, message: caught.message } });
```

The same applies to anything else `JSON.stringify` drops or rewrites — `Map`, `Set`, `undefined`
values, class instances with getters. `Date` is fine: it serializes to an ISO string and the
generated hook's date reviver turns it back into a `Date`.

## SSEConnection

| Member                 | Behaviour                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `publish(event, data)` | Sends one SSE frame with the JSON-stringified payload             |
| `end()`                | Sends a final `end` event, waits 200ms, then closes the response |
| `onClose(cb)`          | Fires once when the client disconnects; callbacks then clear      |
| `closed`               | True after a client disconnect or `end()`                        |

Once the connection is closed, `publish` returns without doing anything — a producer that keeps
running after the client left does not throw, so a long loop needs its own `closed` check to stop
early:

```typescript
for await (const token of tokens) {
  if (sse.closed) break;
  sse.publish("onToken", { token });
}
```

`end()` is what tells the client this stream finished normally rather than dropped. Without it the
client's error path runs and it retries the connection.

## Generated hook

`@stream` generates a hook named after the method (or `resourceName`), wrapping `useSSEStream`:

```typescript
const { isConnected, isEnded, error, retryCount } = useAsk(
  { prompt },
  {
    onToken: ({ token }) => setText((t) => t + token),
    onComplete: ({ fullText }) => setText(fullText),
    end: () => setDone(true),
  },
  { enabled: prompt.length > 0 },
);
```

- Parameters are serialized into the query string, so a `@stream` method's parameters must survive a
  query round trip.
- `handlers` accepts every declared event key plus `end`, which fires on the frame `end()` sends.
  Only the keys present get listeners registered.
- The third argument is not optional in the generated wrapper. `SSEStreamOptions` is
  `{ enabled?, retry?, retryInterval? }`, defaulting to enabled with 3 retries at 3s.
- Payloads are parsed with a date reviver, so ISO date strings arrive as `Date` objects.
- Reconnection is handled by the hook, not by `EventSource` — it closes on error and retries up to
  `retry` times, then sets `error` and stops. Receiving `end` stops retrying and sets `isEnded`.
