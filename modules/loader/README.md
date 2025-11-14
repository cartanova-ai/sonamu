# @sonamu-kit/loader

@sonamu-kit/loader는 [`@loaderkit/ts`](https://www.npmjs.com/package/@loaderkit/ts)를 기반으로 하여 Sonamu 프레임워크에서 사용할 목적으로 약간의 수정을 가한 TypeScript 로더입니다.

- esbuild 대신 swc를 사용하여 트랜스파일하도록 바꾸었습니다.
- `.ts` 확장자를 가진 fully resolved path(`file:///...`)도 처리할 수 있도록 버그(?)를 고쳤습니다.

Credit: [laverdet](https://github.com/laverdet) for [`@loaderkit/ts`](https://www.npmjs.com/package/@loaderkit/ts). Thank you for your great work!

---

[![npm version](https://badgen.now.sh/npm/v/@loaderkit/ts)](https://www.npmjs.com/package/@loaderkit/ts)
[![isc license](https://badgen.now.sh/npm/license/@loaderkit/ts)](https://github.com/braidnetworks/loaderkit/blob/main/LICENSE)
[![github action](https://github.com/braidnetworks/loaderkit/actions/workflows/build.yaml/badge.svg)](https://github.com/braidnetworks/loaderkit/actions/workflows/build.yaml)
[![npm downloads](https://badgen.now.sh/npm/dm/@loaderkit/ts)](https://www.npmjs.com/package/@loaderkit/ts)

🐘 @loaderkit/ts - A nodejs loader for TypeScript
=================================================

This is a simple loader for well-configured TypeScript projects running in nodejs.

This loader does not perform any type checking. It only performs transpilation. A well-configured
project should run `tsc -b -w` in a separate process.

This loader should only be used in projects which use ECMAScript modules. A well-configured project
should not be using CommonJS.

Source maps are passed along in the transpilation process, so the `--enable-source-maps` nodejs flag
is recommended.

An extra degree of care has been taken to ensure that `import.meta.url` is correct. My belief is
that the behavior of your program should not be different between development and production
versions. And I don't think that this should be controversial either. So, when an output destination
is specified in the nearest `tsconfig.json` then `import.meta.url` will be the value it would have
been if run from the `tsc`-transpiled output.


EXAMPLE
-------

`main.ts`
```ts
const value: string = 'hello world';
console.log(value);
```

```
$ node --import @loaderkit/ts test.ts
hello world
```
