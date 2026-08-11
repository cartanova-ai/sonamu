# Character Chunking

## Public API

Importing `Chunking` still resolves the whole `sonamu/vector` entry point. That entry point eagerly
re-exports the embedding module, whose static `ai` import makes `ai` required even for a
chunking-only consumer. The provider-specific `voyageai` and `@ai-sdk/openai` packages remain
unnecessary until their provider path is invoked; use the single install matrix in the entry
point's **API Key Configuration** section.

```typescript
import { Chunking } from "sonamu/vector";

const chunking = new Chunking({
  chunkSize: 500,
  chunkOverlap: 50,
  minChunkSize: 50,
  skipThreshold: 200,
});

const chunks = chunking.chunk(source);
const needed = chunking.needsChunking(source);
const estimate = chunking.estimateChunkCount(source);
```

The constructor accepts a partial `ChunkingConfig`; omitted fields use
`DEFAULT_VECTOR_CONFIG.chunking`. The class uses JavaScript string length and offsets, so it counts
UTF-16 code units rather than tokens or Unicode grapheme clusters. There is no public `chunkText()`
function and no token, sentence, semantic, or Markdown mode.

## How `chunk()` splits

Text shorter than `skipThreshold` returns one chunk immediately. Otherwise Sonamu repeatedly:

1. Examines up to `chunkSize + 100` source characters.
2. Tries separators in configured priority order.
3. For the first separator with a match starting at or before `chunkSize`, takes its last eligible
   match and includes the separator in the chunk. The included separator can extend the result
   beyond `chunkSize`.
4. Falls back to exactly `chunkSize` characters when no separator qualifies.
5. Trims the chunk and keeps it only when the trimmed length is at least `minChunkSize`.
6. Advances by `max(extractedLength - chunkOverlap, minChunkSize)` source characters.

The default separator priority is paragraph break, newline, `。`, `. `, `! `, `? `, `, `, then a
space. Priority wins over fullness: a paragraph break can be chosen even when a later-priority space
would fill more of the chunk.

`chunkOverlap` revisits source characters by moving the next start offset backward relative to the
extracted length. It is not a token overlap. Because returned `text` is trimmed while offsets refer
to the original source interval, slicing `source.slice(startOffset, endOffset)` can include leading
or trailing whitespace absent from `text`.

Consuming the final remainder does not end the loop immediately: Sonamu still advances by the
overlap formula. It can therefore emit shorter trailing suffix chunks with the same `endOffset` as
the preceding chunk, including an overlap-only final chunk when that suffix meets `minChunkSize`.

## Return values and helper differences

```typescript
type Chunk = {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
};
```

Indexes are reassigned only to chunks that survive `minChunkSize`, so they remain contiguous.

The helpers are intentionally simpler than `chunk()`:

- `needsChunking(text)` returns `text.length > chunkSize`. It ignores `skipThreshold`, separators,
  and `minChunkSize`.
- `estimateChunkCount(text)` returns `1` at or below `chunkSize`; otherwise it calculates
  `ceil(text.length / (chunkSize - chunkOverlap))`. It does not simulate delimiter splits.

These can disagree with the actual chunk path when custom `skipThreshold` and `chunkSize` values
cross. Treat the estimate as capacity planning, not a promised output count.

## Configuration boundaries

`separators` must not contain the empty string `""`. Once `chunk()` reaches separator search for a
remaining segment longer than `chunkSize`, an empty-string search never reaches the `-1` termination
condition after the cursor passes the end of the search range. `chunk()` then remains in the
synchronous separator loop and can freeze the process.

The constructor performs no numeric validation. Keep `minChunkSize` positive so the loop advances
when overlap consumes the extracted length. Keep `chunkOverlap < chunkSize` so
`estimateChunkCount()` has a finite positive divisor. Very large overlap is reduced in practice
because `minChunkSize` is the minimum advance.

Character limits do not guarantee provider token limits. If the provider limit matters, measure
tokens separately before `Embedding.embed()`; `DEFAULT_VECTOR_CONFIG.*.maxTokens` is metadata and
does not enforce it.
