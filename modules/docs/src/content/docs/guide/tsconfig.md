---
title: 타입스크립트 설정
description: 타입스크립트 설정 파일 가이드 문서
---

Sonamu를 사용하기 위해 필요한 타입스크립트 설정에 대한 가이드 문서입니다.

## 백엔드

### 기본 경로

소스코드의 기본 경로를 `src`로, 컴파일된 결과물의 경로를 `dist`로 설정해야 합니다.

```json
// api/tsconfig.json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### decorator

타입스크립트 데코레이터를 사용하기 위해 `experimentalDecorators` 옵션과 `emitDecoratorMetadata` 옵션을 활성화해야 합니다.

```json
// api/tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### json 변경 감지

JSON 파일의 변경을 감지할 수 있도록 `tsconfig.json` 파일에 `resolveJsonModule` 옵션을 추가해야 합니다.

```json
// api/tsconfig.json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

## 프론트엔드

### baseUrl

프론트엔드 컴포넌트 스캐폴딩 및 `sonamu.generated.ts` 동기화 작업에서 사용하는 기본 디렉터리 관련 설정을 `tsconfig.json` 파일에 추가해야 합니다.

```json
// web/tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "."
  }
}
```
