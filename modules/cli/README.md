# `@sonamu-kit/cli`

The dedicated Sonamu CLI. Version 0.1.0 uses Optique 1.2.4 and requires
`sonamu ^0.11.0`.

## Install

```sh
pnpm add sonamu@^0.11.0 @sonamu-kit/cli@0.1.0
```

`@sonamu-kit/cli` is the only package that provides the `sonamu` executable.
The previous Sonamu-owned tsicli implementation has been removed.

## Interactive use

Run without arguments in a terminal to search for a command:

```sh
sonamu
```

Incomplete command paths such as `sonamu fixture` also open fuzzy selection.
Entity commands can select an Entity when it is omitted or misspelled. Explicit
valid arguments skip prompts.

Use Optique's generated metadata to inspect the exact grammar:

```sh
sonamu --help
sonamu fixture fetch --help
sonamu --version
```

## Automation

Scripts and coding agents should always use `--non-interactive --json` and
provide every required argument:

```sh
sonamu entity show User --non-interactive --json
sonamu scaffold preview --entity User --template model --non-interactive --json
sonamu migrate preview production --action rollback --non-interactive --json
```

Missing input exits with code 2 instead of prompting. A non-TTY invocation never
prompts even when `--non-interactive` is omitted.

Finite JSON commands write one newline-terminated envelope to stdout:

```json
{"ok":true,"command":"entity.show","data":{"id":"User"},"warnings":[]}
```

Failures use the same channel:

```json
{"ok":false,"command":"entity.show","error":{"code":"MISSING_ARGUMENT","message":"Missing entity argument."},"exitCode":2}
```

`task watch --json` emits one JSON object per event. Long-running `dev` and
`start` commands reject `--json` before starting a child process.

## Logging

The CLI uses LogTape options provided by Optique. Add `-v`, `-vv`, or `-vvv`
to select `info`, `debug`, or `trace` logging from the default `warning` level.
The long `--verbose` option is repeatable and raises the level once per use.

```sh
sonamu sync -vv
sonamu migrate status --log-output=- --log-format=plain
sonamu task watch --log-output=sonamu.log --log-format=jsonl
```

`--log-format` accepts `jsonl`, `logfmt`, `color`, or `plain`. Logs default to
stderr when `--log-output` is omitted. `--log-output=-` also writes logs to
stderr; another value is treated as a file path. JSON command envelopes and events remain the only stdout content in
`--json` mode. Without a logging option, the project’s Sonamu logging
configuration is unchanged.

## Mutations

Mutation commands default to preview or dry-run where their grammar supports it.
Review the result, then pass the execution flags shown by `--help`.

```sh
sonamu scaffold batch --entity User --template model --execute --confirm --non-interactive --json
sonamu fixture import User 1 2 --execute --confirm --non-interactive --json
sonamu migrate rollback production --execute --confirm --force-reason INCIDENT_ID --non-interactive --json
```

Non-interactive mutations require `--execute --confirm`. Production migration
changes also require `--force-reason`. Shadow migration accepts only `test`
and `fixture`. Preview and dry-run paths do not perform their mutation.

## Completion

```sh
eval "$(sonamu completion bash)"
eval "$(sonamu completion zsh)"
eval "$(sonamu completion fish)"
sonamu completion pwsh > sonamu-completion.ps1
sonamu completion nu | save sonamu-completion.nu
```

## Exit codes

| Code | Meaning |
| ---: | --- |
| 0 | Success or completed preview |
| 1 | Runtime or domain failure |
| 2 | Invalid or incomplete input |
| 3 | Missing mutation approval |
| 130 | Interactive cancellation |

`dev` and `start` preserve child-process exit codes.
