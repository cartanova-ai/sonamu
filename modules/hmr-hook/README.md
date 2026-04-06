# @sonamu-kit/hmr-hook

> 이 문서는 사람이 썼습니다.

`hot-hook`([NPM](https://www.npmjs.com/package/hot-hook), [GitHub](https://github.com/Julien-R44/hot-hook/tree/main/packages/hook))을 fork하여 뜯어고친 패키지입니다.

## 얘가 하는 일

모듈이 변경되었으면 import할 때 ESM의 캐시를 뚫고 새로 가져와줍니다.

이런 식으로 씁니다:

```bash
node --import=@sonamu-kit/hmr-hook/register index.js
```

## Fork해서 뜯어고친 부분

### 1. 변수 기반 동적 Import 허용

원본은 자체적인 제약사항으로, `await import('./something')` 같은 것만 유효한 동적 import로 인정했습니다. `'./something'` 자리에 스트링 리터럴이 아니라 변수가 들어가면 유효하지 않은 것으로(=HMR 불가) 간주하였습니다.

이를 조금 완화하여, 변수 기반의 동적 import(`await import(variablePath)`)도 유효한 동적 import로 인정하도록 변경하였습니다.

### 2. Boundary 간 정적 Import 허용

원본은 또 누군가가 boundary를 정적 import하는 것을 허용하지 않습니다.

그런데 boundary가 boundary를 정적 import하는 것은 가능해야 한다고 판단하여, 이를 허용하도록 변경하였습니다.

### 3. 파일시스템 워쳐 비활성화

원본은 자체적으로 파일시스템 워쳐를 사용하여 파일 변경을 감지하고 있습니다.

그런데 이렇게 하면 파일이 변경되었을 때 Sonamu의 syncer가 코드를 생성하고 다시 로드하는 시점과 `hmr-hook`이 모듈을 무효화 처리하는 시점의 순서가 종종 어긋나는 문제가 있었습니다.

이를 해결하기 위해 `hmr-hook`의 파일시스템 워쳐를 비활성화하고, 파일 변경 이벤트를 외부에서 넣어주도록 하였습니다.

그리하여 오직 Sonamu의 syncer만이 파일 변경을 감지하고, `hmr-hook`에게 파일 변경 이벤트를 넣어주어 모듈 invalidate을 처리할 수 있도록 하였습니다.

### 4. `ts-loader`와의 통합 개선

`ts-loader`는 import 속성의 경로로 `dist`의 `.js` 파일을 가리키는데 `hmr-hook`은 실제 `src`의 `.ts` 파일 경로를 필요로 합니다. 이 불일치를 해결하기 위해 `ts-loader`가 추가적으로 넘겨주는 실제 `.ts` 파일 경로를 사용하도록 바꾸었습니다.
