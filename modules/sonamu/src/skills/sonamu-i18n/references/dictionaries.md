# Dictionary authoring and locale resolution

## Define the contract in the default locale

The default-locale object defines project keys and the parameter list of every function-valued
translation. Export it as a const object:

```typescript
import { createFormat, josa } from "sonamu/dict";

const format = createFormat("ko");

export default {
  "common.save": "저장",
  "common.results": (count: number) => `${count}개 결과`,
  "validation.required": (field: string) => `${josa(field, "은는")} 필수입니다`,
  "report.createdAt": (date: Date) => format.date(date),
} as const;
```

Every additional locale is a partial implementation of that merged contract. `defineLocale`
checks key names and preserves function parameter types while allowing untranslated keys to be
omitted.

```typescript
import { plural } from "sonamu/dict";

import { defineLocale } from "./sd.generated";

export default defineLocale({
  "common.save": "Save",
  "common.results": (count: number) =>
    plural(count, { one: `${count} result`, other: `${count} results` }),
  "validation.required": (field: string) => `${field} is required`,
});
```

When changing `defaultLocale`, change the new default file to the const-object form and the other
locale files to `defineLocale(...)`, then run `pnpm sonamu sync`.

## Resolve the current locale

The generated modules use different locale state by runtime:

| Runtime | `SD(...)` locale source |
| --- | --- |
| API | `Sonamu.getContext().locale`; outside a Context, or when it is nullish, `defaultLocale` |
| Web/app target | Module state initialized to `defaultLocale` and changed by `setLocale(locale)` |

For HTTP and WebSocket requests, Sonamu initializes `Context.locale` from the first supported base
language in `Accept-Language` and otherwise uses `defaultLocale`. A custom context provider can
return a different locale. An unsupported current locale still reaches dictionary fallback.

`SD.locale(locale)` creates a lookup function for one supported locale without changing the current
API Context or the web/app module state:

```typescript
SD("common.save");

const EN = SD.locale("en");
EN("common.save");

setLocale("ja"); // web/app generated module only
SD("common.save");
```

## Understand dictionary fallback

Every lookup follows this order:

1. The requested or current locale.
2. `defaultLocale` if it is different.
3. Every remaining entry in `supportedLocales`, in configuration order.
4. The raw dictionary key.

The default locale normally prevents a project key from reaching steps 3 or 4 because it owns the
type contract. The same fallback also applies to dynamically constructed enum keys.

## Entity and enum labels

`pnpm sonamu sync` reads loaded entity definitions and generates these keys:

```text
entity.<EntityId>             entity title
entity.<EntityId>.<propName>  non-empty property description
enum.<EnumId>.<value>         enum label
```

Generated entity and enum labels are inserted only into the default-locale dictionary. Override a
label in another locale by defining the same key in that locale file:

```typescript
export default defineLocale({
  "entity.Project": "Project",
  "entity.Project.name": "Project name",
  "enum.ProjectStatus.active": "Active",
});
```

Translations change labels, not the enum values stored or sent by the application.

`SD.enumLabels(enumName)` is a dynamic `Proxy`:

```typescript
const labels = SD.enumLabels("ProjectStatus");
labels.active;
```

Both the enum name and property key are strings, so this API does not validate either at compile
time. A missing label follows normal dictionary fallback and ultimately returns the raw key, such as
`enum.ProjectStatus.unknown`.

## `LocalizedString` boundaries

Generated `SD` results are branded as `LocalizedString`. Framework APIs that accept this technical
type, including Sonamu exception message constructors, reject an unbranded string:

```typescript
throw new BadRequestException(SD("validation.required")("Email"));
```

Add a missing key to the default-locale dictionary when `SD("...")` rejects it, then run
`pnpm sonamu sync` so the generated `DictKey` and function signature are rebuilt.
