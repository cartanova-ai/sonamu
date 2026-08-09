# Forms and Files

## `useTypeForm`

`useTypeForm(schema, defaultValue)` infers the form type from a Zod object or array and returns
`form`, `setForm`, `register`, `submit`, `addError`, `removeError`, `clearError`, and `reset`.

```tsx
const { form, register, submit } = useTypeForm(ProjectSaveParams, {
  name: "",
  description: null,
  attachments: [],
});

<Input {...register("name")} />;
<Textarea {...register("description")} />;
```

`register(path)` returns `value`, `onValueChange`, and an optional `error`. It reads nested dot and
array paths. A `null` or `undefined` form value is presented to the component as `""`; when the
direct schema at that path is nullable, an empty string is stored as `null`, and when it is optional,
an empty string is stored as `undefined`. Pass the second argument to override that conversion:

```tsx
<Input {...register("nickname", "nullable")} />
```

Changing a registered field removes its error. `reset()` restores the original `defaultValue` and
does not clear the error map; call `clearError()` as well when both must be reset.

The schema is not parsed on submit. `submit()` transforms files and calls the callback, but does not
run `parse` or `safeParse`. Perform runtime validation separately when the form can contain values
that bypass its inferred TypeScript type.

## Lazy file upload through `submit`

`submit(callback)` recursively finds browser `File` objects in the current form. It replaces each
one with the `SonamuFile` returned by the configured uploader, writes the transformed form back to
state, and passes it to the callback. An array containing only files is uploaded in one uploader
call; other arrays are traversed element by element.

```tsx
const handleSubmit = submit(async (form) => {
  await ProjectService.save([form]);
});

<FileInput
  {...register("attachments")}
  multiple
  uploadMode="lazy"
  viewMode="file"
  maxFiles={5}
/>
<Button onClick={handleSubmit}>Save</Button>
```

Calling the mutation directly with `form` bypasses this traversal. That is correct when the form has
no pending `File`; a lazy `FileInput` requires the `submit()` wrapper before sending the form.

## `FileInput` modes

| Mode | Value after file selection | When uploader runs |
| --- | --- | --- |
| `eager` | Uploaded `SonamuFile` | Immediately in `FileInput` |
| `lazy` | Browser `File` | Later in `useTypeForm.submit()` |

`viewMode="image"` defaults `accept` to `image/*`; `viewMode="file"` defaults it to `*/*`.
Single mode accepts `SonamuFile | File | null`. Multiple mode requires `multiple` and accepts an
array; `maxFiles` defaults to 10. `previewSize` is `sm`, `md`, `lg`, or `xl`.

Removal is available whenever the input is not disabled; there is no `clearable` prop.

Both upload modes ultimately call the `uploader` from `SonamuProvider`. Without one, an eager upload
shows the component's upload-failed alert, and a lazy upload rejects during `submit()`. Configure the
transport as described in `references/provider.md`.
