# @sonamu-kit/hot-runner

이 패키지는 [@hot-hook/runner](https://github.com/Julien-R44/hot-hook/tree/main/packages/runner)를 기반으로 한 패키지입니다.

Credit: [Julien Ripouteau](https://github.com/Julien-R44) for [@hot-hook/runner](https://github.com/Julien-R44/hot-hook/tree/main/packages/runner). Thank you for your great work!

## 원본 패키지로부터의 변경사항

이 패키지는 원본 패키지를 **수정 없이 그대로 사용**하고 있습니다.

The Hot Hook runner is a simple process manager that allows you to reload your NodeJS application only when necessary and requested by Hot Hook.

## Installation

```bash
pnpm add @hot-hook/runner
```

## Utilisation

```bash
pnpm hot-runner bin/server.js
```

To use with Typescript, you can pass a hook like this:

```bash
# Run with ts-node
pnpm hot-runner --node-args="--loader=ts-node/esm" bin/server.ts

# Run with TSX
pnpm hot-runner --node-args="--import=tsx" bin/server.ts
```


## Flags

### `--clear-screen`

Clears the console contents after each reload.

### `--node-args`

Arguments to pass to NodeJS. For example, `--node-args="--inspect"`.

### `--script-args`

Arguments to pass to your script. For example, `--script-args="--port=3000"`.
