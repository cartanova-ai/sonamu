# Embedding Calls

## Setup

Use the install matrix in the entry point's **API Key Configuration** section. It is declared there
once because the eager `ai` dependency applies to both embedding and chunking, while `voyageai` and
`@ai-sdk/openai` are needed only when their respective dynamic provider paths run.

Set `VOYAGE_API_KEY` or `OPENAI_API_KEY` in the API process environment. Sonamu reads these names;
provider `apiKey` values passed to `createVectorConfig()` are not consulted. The provider `baseUrl`
fields are also not passed to either SDK.

## Public calls

```typescript
import { Embedding } from "sonamu/vector";

const one = await Embedding.embedOne(text, "voyage", "document");

const many = await Embedding.embed(
  texts,
  "voyage",
  "document",
  (processed, total) => console.log(`${processed}/${total}`),
);

const dimensions = Embedding.getDimensions("voyage");
```

| Argument | Contract |
| --- | --- |
| `provider` | `"voyage" \| "openai"`; selects the SDK and checked-in model |
| `inputType` | `"document" \| "query"`, default `"document"`; forwarded only to Voyage |
| `onProgress` | Optional callback on `embed()`; see batching behavior below |

`embedOne()` delegates to `embed([text], ...)` and returns its first result. `embed()` preserves
batch order when it flattens the provider results.

## Provider behavior

| Behavior | Voyage | OpenAI |
| --- | --- | --- |
| Default model | `voyage-3` | `text-embedding-3-small` |
| Request method | `VoyageAIClient.embed({ input, model, inputType })` | AI SDK `embedMany({ model, values })` |
| `inputType` | Forwarded | Ignored |
| Default batch size | 128 | 100 |
| `getDimensions()` | 1024 | 1536 |
| Result `model` | Checked-in model string | Checked-in model string |

The exported `Embedding` value is a singleton whose constructor is not exported. Consequently,
`createVectorConfig()` cannot replace its model, dimensions, batch size, or client options. That
helper shallow-merges configuration data within each section, but no public vector runtime accepts
the resulting object. Its `Partial<VectorConfig>` is top-level only: when supplying a section in
TypeScript, spread the corresponding default to provide the section's other required fields.

```typescript
import { createVectorConfig, DEFAULT_VECTOR_CONFIG } from "sonamu/vector";

const configData = createVectorConfig({
  voyage: { ...DEFAULT_VECTOR_CONFIG.voyage, batchSize: 64 },
});
```

## Results, batching, and tokens

Each result has this shape:

```typescript
type EmbeddingResult = {
  embedding: number[];
  model: string;
  tokenCount: number;
};
```

When the input count is at or below the provider batch size, Sonamu invokes the provider path once
and never calls `onProgress`. Above the limit it slices the inputs, starts every batch concurrently
with `Promise.all`, and calls `onProgress(total, total)` once after every batch succeeds. It does
not report per-batch progress or limit concurrent provider work.

Both SDK paths expose usage for a whole request. Sonamu copies that request's total token count onto
every result in that batch; it is not a per-text count and summing result `tokenCount` values
overcounts usage. Missing usage becomes `0`.

`maxTokens` is stored in `DEFAULT_VECTOR_CONFIG` but never checked, and no tokenizer truncates or
splits an over-limit input. `getDimensions()` returns configured metadata only; it does not inspect
the response. Validate length before persistence when a model or database schema can differ.

## Failures and operational boundaries

Sonamu throws these errors before or immediately after a provider call:

- `VOYAGE_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.`
- `OPENAI_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.`
- `Voyage API: 응답 데이터가 없습니다.` when the Voyage response has no `data`

A Voyage item with no embedding becomes `[]`; there is no length check. Provider and AI SDK errors
otherwise propagate without translation or retry.

Embedding calls send the supplied text to the selected external provider. The vector module adds no
cache, deduplication, retry, rate limiter, request queue, or aggregate usage/cost accounting, so it
does not suppress repeated provider work. It also has no `rerank()` API and does not invoke a
reranking model.
