# @sonamu-kit/react-components 설정 가이드

## 완료된 작업 ✅

### 1. 기본 구조 생성

```
packages/react-components/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   └── button.tsx
│   │   └── index.ts
│   ├── hooks/
│   │   └── index.ts
│   ├── lib/
│   │   ├── utils.ts
│   │   └── index.ts
│   ├── router/
│   │   └── index.ts
│   └── styles/
│       └── globals.css
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
└── components.json
```

### 2. 의존성 설치

- ✅ tailwindcss
- ✅ @tanstack/react-router
- ✅ shadcn/ui 관련 패키지 (clsx, tailwind-merge, cva, lucide-react)
- ✅ tailwindcss-animate

### 3. Workspace 연결

- ✅ web/package.json에 workspaces 설정
- ✅ @sonamu-kit/react-components를 web 프로젝트에서 사용 가능

### 4. PoC 테스트 페이지

- ✅ `/admin/shadcn-test` 페이지 생성
- ✅ Button 컴포넌트 테스트

## 테스트 방법

1. 개발 서버 실행:

```bash
cd /Users/sehyeal/Development/amr/web
yarn dev
```

2. 브라우저에서 접속:

```
http://localhost:22001/admin/shadcn-test
```

## 다음 단계 🚀

### 1. tanstack-router 기본 설정

- Router 설정 파일 생성
- 기본 route 구조 설계
- react-router-dom과의 마이그레이션 전략

### 2. useTypeForm, useListParams 통합 hooks

- 기존 @sonamu-kit/react-sui의 hooks 분석
- shadcn/ui와 통합되는 새로운 hooks 설계
- Form 관련 컴포넌트 생성

### 3. 추가 컴포넌트

shadcn/ui CLI를 사용하여 필요한 컴포넌트 추가:

```bash
cd packages/react-components
npx shadcn@latest add input
npx shadcn@latest add form
npx shadcn@latest add select
npx shadcn@latest add table
# ... 등등
```

### 4. Figma Maker 코드 통합

- 디자이너와 협업하여 생성된 Figma 코드 통합
- 컴포넌트 스타일 커스터마이징

### 5. 점진적 마이그레이션

- Admin 페이지 중 하나를 선택하여 완전히 교체
- semantic-ui-react → shadcn/ui 마이그레이션
- react-router-dom → tanstack-router 마이그레이션

### 6. sonamu/ui로 이전 준비

- 독립적인 패키지로 완성
- 문서화
- 테스트 코드 작성
- npm 퍼블리시 준비

## 주의사항 ⚠️

1. **Peer Dependencies 경고**
   - 현재 @sonamu-kit/react-components가 react, react-dom을 찾지 못하는 경고가 있음
   - 실제 동작에는 문제 없음 (web 프로젝트의 react 사용)
   - 필요시 shadcn-ui/package.json에 react, react-dom을 devDependencies에 추가 가능

2. **스타일 충돌**
   - 기존 semantic-ui-css와 tailwindcss가 공존할 수 있음
   - 점진적 마이그레이션 시 스타일 충돌 주의

3. **Import Path**
   - `@sonamu-kit/react-components/components` - 컴포넌트
   - `@sonamu-kit/react-components/hooks` - 훅스
   - `@sonamu-kit/react-components/lib` - 유틸리티
   - `@sonamu-kit/react-components/router` - 라우터 설정
   - `@sonamu-kit/react-components/styles` - 스타일 (entry point에서 한 번만 import)
