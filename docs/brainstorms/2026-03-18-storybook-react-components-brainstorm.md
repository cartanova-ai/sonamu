# Storybook for @sonamu-kit/react-components

**Date**: 2026-03-18
**Linear**: SON-385
**Status**: Brainstorm Complete

## What We're Building

react-components 패키지(70개+ shadcn/ui 기반 컴포넌트)에 Storybook 10을 도입하여 개별 컴포넌트 명세화/시각화 환경을 구축한다. Agentation을 통합하여 AI 피드백 루프를 지원한다.

### Scope

- Storybook 10.2.19 + `@storybook/react-vite` 세팅
- Tailwind v4 통합
- Agentation 데코레이터 통합
- 대표 컴포넌트 스토리 작성 (전체가 아닌 핵심 컴포넌트)

### Out of Scope

- demo/ 앱 제거 또는 변경 (demo/는 통합 시연용으로 유지)
- 전체 70개+ 컴포넌트 스토리 작성 (점진적 추가)
- Vitest play 함수 테스트 통합 (후속 작업)

## Why This Approach

### 기존 리서치 기반 (SON-399)

`~/Projects/storybook-practice`에서 검증한 패턴을 그대로 가져온다:

- `@storybook/react-vite`: react-components가 이미 Vite 기반이므로 자연스러운 선택
- Tailwind v4 Vite 플러그인: `@tailwindcss/vite`를 Storybook Vite config에도 적용
- Agentation preview 데코레이터: 캔버스 오버레이로 AI 피드백 마킹

### demo/와의 역할 분리

| 환경 | 역할 |
|---|---|
| demo/ | 컴포넌트 간 통합, 페이지 단위 시연, TanStack Router 라우팅 확인 |
| Storybook | 개별 컴포넌트 명세, props 탐색, 상태별 시각화, Agentation AI 피드백 |

## Key Decisions

1. **Storybook 10.2.19** 사용 (최신 버전)
2. **스토리 파일은 컴포넌트 옆에 배치** (co-location): `button.tsx` 옆에 `button.stories.tsx`
3. **demo/는 유지**, Storybook과 공존
4. **Agentation 통합 포함** (preview 데코레이터)
5. **대표 컴포넌트만 먼저 스토리 작성**, 나머지는 점진적 추가

## Target Components (Phase 1)

### Form 계열
- **Button**: 기본 variants, sizes, disabled, loading
- **Input**: text, password, disabled, error
- **Select** (Sonamu 커스텀): 기본 선택, 검색, 비동기 로딩

### Layout/Overlay 계열
- **Dialog**: open/close, sizes, form dialog
- **Sheet**: side variants
- **Tabs**: 기본 탭, 동적 탭

### Sonamu 커스텀
- **EnumSelect**: enum 기반 선택
- **SonamuFilter**: 필터 모달/팝오버

## Technical Plan

### 설정 파일 구조

```
modules/react-components/
├── .storybook/
│   ├── main.ts          # 스토리 경로, Vite 설정, 애드온
│   └── preview.tsx      # Agentation 데코레이터, 글로벌 스타일
├── src/components/ui/
│   ├── button.tsx
│   ├── button.stories.tsx
│   └── ...
```

### 주요 설정 포인트

- `.storybook/main.ts`: stories glob은 `../src/**/*.stories.@(ts|tsx)`
- `.storybook/main.ts`: Vite에 `@tailwindcss/vite` 플러그인 추가
- `.storybook/preview.tsx`: Agentation 데코레이터 + globals.css import
- `vite.config.ts`: 빌드 시 `*.stories.*` 제외 필요
- `package.json`: storybook, build-storybook 스크립트 추가

### 폼 컴포넌트 스토리 패턴

`useArgs` 훅으로 Controls 패널 양방향 바인딩:

```tsx
const meta: Meta<typeof Input> = {
  component: Input,
  args: { value: '' },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <Input {...args} onChange={(e) => updateArgs({ value: e.target.value })} />;
  },
};
```

## Open Questions

(없음 - 모두 해결됨)
