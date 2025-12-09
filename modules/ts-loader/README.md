# @sonamu-kit/ts-loader

> 이 문서는 사람이 썼습니다.

`@loaderkit/ts`([NPM](https://www.npmjs.com/package/@loaderkit/ts), [GitHub](https://github.com/braidnetworks/loaderkit/tree/main/packages/ts))를 fork하여 뜯어고친 패키지입니다.

## 얘가 하는 일

TypeScript 파일을 직접 실행할 수 있게 도와줍니다. 

`ts-node` 또는 `tsx`와 비슷합니다.

이런 식으로 씁니다:
```bash
node --import @sonamu-kit/ts-loader test.ts
```

## 얘가 원래 특이한 점

보통 `ts-node`나 `tsx`로 실행하면 import 경로(`import.meta.filename`)가 실제 ts 파일의 위치가 됩니다.

얘는 컨셉이 조금 다릅니다. 마치 빌드한 `dist` 폴더에 있는 `.js` 파일만 존재하는 것처럼 작동합니다.
- `dist`의 `.js` 경로로 import해도 자동으로 `src`의 `.ts` 파일을 찾아서 트랜스파일해서 줍니다.
- `src`의 `.ts` 경로로 import해도 당연히 잘 트랜스파일해서 줍니다.
- `import.meta.filename`은 `dist`의 `.js` 파일의 경로가 됩니다.

이는 원작자가 *개발 환경과 실행 환경에서 import 경로(특히 `import.meta`)가 달라지는건 문제가 있다*는 철학을 가지고 있기 때문입니다.

## Fork해서 뜯어고친 부분

### 1. 트랜스파일러 변경: esbuild -> swc

그냥 swc로 맞추고 싶어 바꾸었습니다.

### 2. 큰 버그 해결: `.ts` 확장자 Fully Resolved Path 처리

`file:///.../specifier.ts` 형식의 TypeScript 파일을 직접 import할 수 있도록 하였습니다.

원본은 `file:///`로 시작하는 경로를 무조건 "트랜스파일된 js 파일"로 간주하여 "이에 상응하는 ts 소스 파일"을 찾아오려는 행동을 하였습니다만, 애초에 주어진게 ts 파일인데 그런게 있을 리가 없습니다.

따라서 경로가 `file:///`로 시작하더라도 TypeScript 파일이면 그대로 반환하도록 수정했습니다.

### 3. 기타 자잘한 버그 해결

- Yarn PnP 경로 관련 이슈 해결