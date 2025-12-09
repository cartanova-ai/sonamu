# @sonamu-kit/loader

@sonamu-kit/loader는 [`@loaderkit/ts`](https://www.npmjs.com/package/@loaderkit/ts)를 기반으로 하여 Sonamu 프레임워크에서 사용할 목적으로 약간의 수정을 가한 TypeScript 로더입니다.

Credit: [laverdet](https://github.com/laverdet) for [`@loaderkit/ts`](https://www.npmjs.com/package/@loaderkit/ts). Thank you for your great work!

## 원본 패키지로부터의 주요 변경사항

### 1. 트랜스파일러 변경 (esbuild → swc)

**위치**: [`utility/swc.ts`](utility/swc.ts) - `transpileSource()` 함수

esbuild 대신 swc를 사용하여 트랜스파일하도록 변경했습니다. swc가 더 빠르며 Sonamu 프로젝트 전반에서 사용 중입니다.

### 2. Yarn PnP Virtual 경로 지원

**위치**: [`utility/swc.ts:14-16`](utility/swc.ts#L14-L16), [`utility/swc.ts:35-36`](utility/swc.ts#L35-L36)

Yarn PnP의 virtual 경로(`.yarn/__virtual__/`)에서 소스맵 파일을 찾을 수 없어 발생하는 오류를 방지하기 위해 `inputSourceMap: false` 옵션을 조건부로 적용합니다.

### 3. `.ts` 확장자 Fully Resolved Path 처리

**위치**: [`esm.ts:179-224`](esm.ts#L179-L224) - `resolve` 훅

`file:///.../specifier.ts` 형식의 TypeScript 파일을 직접 import할 수 있도록 처리합니다. 원본은 `file:///` 경로를 무조건 "트랜스파일된 js 파일"로 간주했으나, TypeScript 파일이면 그대로 반환하도록 수정했습니다.

### 4. Yarn PnP Virtual 경로 트랜스파일 제외

**위치**: [`esm.ts:287-289`](esm.ts#L287-L289)

Virtual 경로의 파일은 이미 빌드된 파일이므로 트랜스파일을 건너뜁니다.

## 관련 커밋

- [`1037683`](https://github.com/cartanova-ai/sonamu/commit/1037683): loader가 swc 트랜스파일 할 때 virtual 경로라면 입력 소스 맵 비활성화
- [`10f1b7a`](https://github.com/cartanova-ai/sonamu/commit/10f1b7a): 더이상 안 쓰는 dynohot의 흔적을 loader에서 제거

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
