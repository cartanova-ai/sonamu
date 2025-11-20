# Sonamu ESM & HMR 마이그레이션 보고서

작성일: 2025년 11월 19일

## 개요

Sonamu 프로젝트를 CommonJS에서 ESM으로 전환하고 HMR 기능을 추가했습니다.

핵심 변경사항:
- TypeScript를 런타임 트랜스파일로 직접 실행 (빌드 불필요)
- 코드 변경 시 서버 재시작 없이 HMR로 즉시 반영
- 파일 감시 및 캐시 무효화 로직을 hot-hook으로 이관

---

## 1. ESM 전환

### 사용자 프로젝트 변경사항

- package.json에 `"type": "module"` 추가해야 합니다.
- tsconfig.json의 `module`을 `ESNext`로, `moduleResolution`을 `bundler`로 변경해야 합니다.
- `__dirname`, `__filename`을 각각 `import.meta.dirname`, `import.meta.filename`로 변경해야 합니다.
- `lodash`를 `lodash-es`로 변경해야 합니다.

---

## 2. 새로운 툴 3종

### @sonamu-kit/loader
TypeScript를 런타임에 SWC로 트랜스파일합니다.
빌드 없이 .ts 파일을 직접 실행 가능합니다.

### @sonamu-kit/hot-hook
파일 변경을 감지하고 모듈 캐시를 무효화합니다.
의존성 트리를 분석하여 변경된 모듈과 그에 의존하는 모듈만 선택적으로 무효화합니다.

원본 hot-hook은 내장 watcher를 사용하지만, Sonamu에서는 이를 비활성화하고 
Sonamu의 chokidar watcher가 파일 변경 이벤트를 직접 hot-hook에 전달하는 방식으로 수정했습니다.
이를 통해 기존 파일 감시 로직을 유지하면서 hot-hook의 캐시 무효화 기능만 활용합니다.

### @sonamu-kit/hot-runner
서버 프로세스를 관리합니다.
hot-hook이 reload해줄 수 없는 파일의 변경(=HMR 불가능한 변경)을 감지하였을 때 또는 SIGUSR2 시그널을 받았을 때 프로세스를 재시작 해줍니다.

---

## 3. HMR 동작 흐름

```
[파일 변경]
    ↓
[Sonamu watcher가 감지]
    ↓
[hot.invalidateFile(path) 호출]
    ↓
[hot-hook이 의존성 트리 분석]
    ↓
[영향받는 모듈들의 캐시 무효화]
    ↓
[다음 import 시점]
    ↓
[loader가 .ts를 트랜스파일]
    ↓
[새 코드 로드 완료]
```

### 캐시 무효화 상세

기존에는 Syncer가 직접 `delete require.cache[filePath]`로 캐시를 삭제했습니다.
ESM에서는 이 방식이 불가능하므로 hot-hook을 사용합니다.

hot-hook은:
1. 의존성 트리에서 해당 파일을 찾습니다
2. 이 파일에 의존하는 모든 파일을 재귀적으로 찾습니다
3. 각 파일의 버전을 증가시킵니다
4. 다음 import 시 버전이 다르면 loader가 새로 트랜스파일합니다

---

## 4. 개발 명령어

### yarn dev
hot-runner와 함께 개발 서버를 실행합니다.
loader와 hot-hook이 활성화되어 코드 변경 시 HMR이 작동합니다.

### yarn build & yarn start
build는 모든 .ts를 .js로 컴파일합니다.
start는 컴파일된 .js를 실행합니다 (프로덕션).
loader나 hot-hook 없이 순수하게 Node.js만으로 실행됩니다.

---

## 5. Syncer 리팩토링

기존 syncer는 syncer.ts 하나에 모든 기능이 집중되어 있었습니다.
이를 역할별로 분리하여 각 파일이 명확한 책임을 가지도록 리팩토링했습니다.

### 변경 전 구조
```
syncer/
├── syncer.ts    (모든 기능)
└── index.ts     (export)
```

### 변경 후 구조
```
syncer/
├── syncer.ts               (메인 Syncer 클래스, watcher 운영)
├── api-parser.ts           (model.ts 파일에서 API 함수 파싱)
├── code-generator.ts       (템플릿 기반 코드 생성)
├── entity-operations.ts    (엔티티 생성/삭제)
├── module-loader.ts        (Entity, Service, Frame, API 로딩)
├── checksum.ts             (변경 감지용 체크섬)
├── file-patterns.ts        (파일 패턴 정의)
└── index.ts                (export)
```

### 주요 변화

**파일 워치 & 캐시 무효화**
기존에는 Syncer가 직접 require.cache를 삭제했으나, 이제는 hot-hook에 위임합니다.
Syncer는 chokidar로 파일 변경을 감지하고, hot.invalidateFile()을 호출하여 hot-hook에게 캐시 무효화를 요청합니다.

**모듈 로딩**
Entity, Service, Frame, API 등을 로드하는 로직을 module-loader.ts로 분리했습니다.
importMembers() 함수를 사용하여 필요한 심볼을 동적으로 import합니다.

**코드 생성**
템플릿을 렌더링하여 코드를 생성하는 로직을 code-generator.ts로 분리했습니다.
Template 클래스와 협력하여 엔티티, 서비스, 뷰 등의 코드를 생성합니다.

---

## 6. Sonamu UI 실행 방식 변경

UI도 사용자 프로젝트 코드를 import하므로 HMR이 필요합니다.
이를 위해 UI를 별도 프로세스로 실행하도록 변경했습니다.

CLI에서 spawn으로 새 Node 프로세스를 생성하며,
`--import` 플래그로 loader와 hot-hook을 미리 로드합니다.
환경 변수로 `HOT=yes`와 `API_ROOT_PATH`를 전달합니다.

---

## 7. Template 시스템 정리

기존에는 템플릿을 모두 임포트해서 템플릿의 key에 따라 적절한 템플릿 인스턴스를 반환하여 주는 로직이 필요하였는데, 이를 변경하였습니다. 이제 `template/implementations/` 디렉토리 아래의 모든 템플릿을 자동으로 로드합니다.
`Sonamu.init()`에서 `Template.autoload()`를 호출하여 처리합니다.

템플릿 렌더링에 필요한 데이터는 이전에 외부 주입(extra)과 내부 조회가 혼용되었으나,
이제 모두 템플릿 내부에서 `EntityManager`나 `Sonamu` 등 퍼블릭 인스턴스 통해 직접 조회하는 방식으로 통일했습니다.

---

## 8. Migration 시스템

마이그레이션 파일을 .ts로 직접 실행합니다.
기존의 .ts → .js 변환 및 비교 로직을 모두 제거했습니다.

migrator.ts 변경사항:
- getMigrationCodes(): .ts만 읽음
- getStatus(): .js 체크 제거
- delCodes(): .js 삭제 로직 제거
- cleanUpDist(): 함수 자체 삭제

이로 인해 `knex_migrations` 테이블의 `name` 컬럼 값에 수정이 필요합니다. 마이그레이션 파일의 확장자를 `.js`에서 `.ts`로 변경해주어야 합니다.

---

## 9. 이외

여기에 명시되지 않은 자잘한 다수의 변경을 포함합니다.