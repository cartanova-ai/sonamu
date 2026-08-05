# @upload — File Upload

`@upload` stands alone. It already registers the POST route and generates the `axios-multipart` and
`tanstack-mutation-multipart` clients, so `httpMethod` and `clients` are not accepted, and adding
`@api` next to it trips `checkSingleDecorator`.

```typescript
@upload({ limits: { files: 10 } })
async upload(): Promise<{ files: SonamuFile[] }> {
  const { bufferedFiles } = Sonamu.getContext();
  // ...
}
```

| Option         | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `guards`       | Authentication/authorization guards                           |
| `limits`       | Fastify multipart limits (`{ files: N }`, `fileSize`, …)       |
| `consume`      | `"buffer"` (default) or `"stream"`                            |
| `description`  | API documentation description                                 |
| `destination`  | Stream mode only, required: which configured disk to write to |
| `keyGenerator` | Stream mode only: function to generate the storage key        |

The generated client appends every file under the form field name `files`. The handler is not tied to
that name — it consumes every part whose type is `file`, in arrival order — so a hand-built request
using a different field name still works, and a request that mixes file fields gets them all in one
`bufferedFiles`/`uploadedFiles` array with no way to tell which field each came from.

## Two or more parameters go in one object

The multipart mutation's parameter type is built by slicing the whole parameter list at its first
colon, and its `mutationFn` forwards only the first parameter to the endpoint function. With two or
more parameters the generated `useUploadMutation` gets a malformed type and silently drops the rest.
One object parameter keeps the generated hook correct.

```typescript
// WRONG — codegen breaks
async upload(entity_type: string, entity_id: number, file_type: string)

// CORRECT — wrap in a single object
async upload(params: { entity_type: string; entity_id: number; file_type: string })
```

Call site:

```typescript
uploadMutation.mutate({
  params: { entity_type, entity_id, file_type },
  files,
});
```

Non-file fields travel as `params[key]` form fields and are reassembled server-side with `qs.parse`,
so a nested object parameter survives the round trip.

## Buffer Mode (Default)

Every file is read into memory as a `BufferedFile` before the method body runs.

```typescript
@upload({ limits: { files: 10 } })
async upload(): Promise<{ files: SonamuFile[] }> {
  const { bufferedFiles } = Sonamu.getContext();

  if (!bufferedFiles || bufferedFiles.length === 0) {
    throw new BadRequestException(SD("file.uploadFailed"));
  }

  return {
    files: await Promise.all(
      bufferedFiles.map(async (file) => ({
        name: file.filename,
        url: await file.saveToDisk("fs", `${await file.md5()}.${file.extname}`),
        mime_type: file.mimetype,
        size: file.size,
      })),
    ),
  };
}
```

| `BufferedFile`              | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `filename` / `mimetype` / `size` | Metadata; `size` is the buffer length         |
| `extname`                   | Extension without the dot, derived from `mimetype` |
| `buffer`                    | The file contents                                 |
| `md5()`                     | MD5 hex digest of the buffer                      |
| `saveToDisk(diskName, key)` | Writes to a configured disk, returns the URL      |
| `raw`                       | The underlying Fastify `MultipartFile`            |

A buffered file has no URL until it is stored — reading `.url` before `saveToDisk` throws
`url이 설정되지 않았습니다.`

## Stream Mode (Large Files)

Each file is streamed straight to storage; the method body sees only metadata.

```typescript
@upload({
  consume: "stream",
  destination: "s3",  // a key of server.storage.drivers
  keyGenerator: (file) => `uploads/${Date.now()}-${file.filename}`,
  limits: { files: 5 },
})
async uploadLargeFiles(): Promise<{ urls: string[] }> {
  const { uploadedFiles } = Sonamu.getContext();
  return { urls: uploadedFiles!.map((f) => f.url) };
}
```

| `UploadedFile`         | Description                                  |
| ---------------------- | -------------------------------------------- |
| `filename` / `mimetype` / `size` | Metadata; `size` is the streamed byte count |
| `key`                  | Key within the storage disk                  |
| `diskName`             | Which disk it was written to                 |
| `url` / `signedUrl`    | Resolved at upload time by the driver        |
| `download()`           | Fetches the stored bytes back as a Buffer    |

`destination` selects one of the disks declared under `server.storage.drivers` in
`sonamu.config.ts` — it names a configured disk, it does not choose a driver type. The disk keys are
the project's own, so `destination` has to match a key that project actually configured. A key with
no matching driver throws on the first upload, not at boot:

```
Unknown disk: "x". Available: fs, s3
```

`keyGenerator` resolves decorator → `server.storage.keyGenerator` → a timestamp-random default, so
omitting it everywhere still produces keys.
