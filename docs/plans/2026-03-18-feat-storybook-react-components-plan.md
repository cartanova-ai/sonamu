---
title: "feat: @sonamu-kit/react-components에 Storybook 10 도입"
type: feat
status: active
date: 2026-03-18
linear: SON-385
brainstorm: docs/brainstorms/2026-03-18-storybook-react-components-brainstorm.md
deepened: 2026-03-18
---

# feat: @sonamu-kit/react-components에 Storybook 10 도입

## Enhancement Summary

**Deepened on**: 2026-03-18
**Research agents used**: framework-docs, best-practices, architecture, performance, simplicity, pattern-recognition (6개)

### Key Improvements

1. **viteFinal 패턴 수정**: `mergeConfig` + dynamic import 사용, `@/` 경로 별칭 추가 (누락 발견)
2. **의존성 정리**: `addon-vitest`, `preview-api` 제거 (YAGNI), `autoInstall: false` 적용
3. **mockUploader 타입 버그 수정**: `SonamuFile` 필드명 불일치 발견 -> 초기 스코프에서 제거
4. **스토리 수 최적화**: 22개 -> 12개 (파이프라인 검증에 충분한 최소 세트)
5. **Phase 구조 압축**: 6단계 -> 3단계
6. **Storybook 10 import 경로 확정**: `storybook/preview-api`, `storybook/test`, `@storybook/react-vite`
7. **브랜치 전략 추가**: 별도 브랜치, 단계별 커밋, 사용자 푸시

### New Considerations Discovered

- `useArgs`는 text input에서 커서 점프 이슈가 있음 -> Input은 `useState` 사용
- CVA argTypes는 Storybook이 자동 감지 못함 -> 수동 지정 필요
- Portal 기반 컴포넌트(Dialog, Sheet)는 `canvasElement.ownerDocument.body`로 DOM 검색 필요
- `storybook-static/`을 `.gitignore`에 추가 필요
- React 플러그인 중복 등록 방지 (`@storybook/react-vite`가 자동 제공)

---

## Overview

react-components 패키지(62개+ shadcn/ui 기반 컴포넌트)에 Storybook 10.2.19를 도입하여 개별 컴포넌트 명세화/시각화 환경을 구축한다. Agentation 데코레이터를 통합하여 AI 피드백 루프를 지원한다.

기존 demo/ 앱(TanStack Router 기반 통합 시연)은 유지하고, Storybook은 개별 컴포넌트 명세/props 탐색/상태별 시각화 전용으로 운영한다.

## Key Decisions

| 항목 | 결정 | 근거 |
|---|---|---|
| Storybook 버전 | 10.2.19 | 최신 안정 버전, ESM-only (Node.js 20.16+) |
| 프레임워크 | `@storybook/react-vite` | 기존 Vite 빌드와 호환 |
| 스토리 파일 위치 | 컴포넌트 옆 co-location | Agentation 워크플로 최적화, Storybook 공식 권장 |
| SonamuProvider | preview.tsx global decorator | 16개 컴포넌트 의존, 일괄 적용이 효율적 |
| Agentation | preview.tsx decorator로 통합 | SON-385 스코프에 포함 |
| 의존성 관리 | pnpm catalog 등록 | 모노레포 버전 일관성 |
| 다크 모드 | 후속 작업 | 초기 스코프 축소 |
| demo/ 앱 | 유지 (공존) | 통합 시연용 역할 분리 |
| 포트 | 6006 (Storybook 기본값) | demo 10290과 충돌 없음 |
| 브랜치 | 별도 브랜치에서 작업 | 단계별 커밋, 푸시는 사용자가 직접 수행 |

## Branch Strategy

- `byeongjun/son-385-storybook-react-components` 브랜치에서 작업한다.
- Phase 완료 시마다 커밋한다.
- 푸시는 사용자가 직접 수행한다.

## Proposed Solution

### Phase 1: Storybook 인프라 + Button baseline 검증

Storybook 설정 파일 생성, 의존성 추가, 빌드 설정 조정, Button 스토리로 파이프라인 검증까지 한 Phase에서 완료한다.

#### 1-1. pnpm catalog에 Storybook 의존성 등록

**파일**: `pnpm-workspace.yaml`

```yaml
storybook: "^10.2.19"
"@storybook/react-vite": "^10.2.19"
"@storybook/addon-a11y": "^10.2.19"
"@storybook/addon-docs": "^10.2.19"
agentation: "^2.3.0"
```

> **Research Insight**: `@storybook/addon-vitest`와 `@storybook/preview-api`는 제외한다. addon-vitest는 CI 통합이 Out of Scope이므로 YAGNI 위반이다. preview-api는 `@storybook/react-vite`의 전이 의존성으로 이미 존재하며, `useArgs`는 `storybook/preview-api` 경로로 직접 import 가능하다.

#### 1-2. package.json 업데이트

**파일**: `modules/react-components/package.json`

devDependencies 추가 (catalog 참조):
```json
{
  "storybook": "catalog:",
  "@storybook/react-vite": "catalog:",
  "@storybook/addon-a11y": "catalog:",
  "@storybook/addon-docs": "catalog:",
  "agentation": "catalog:"
}
```

scripts 추가:
```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```

#### 1-3. `.storybook/main.ts` 생성

**파일**: `modules/react-components/.storybook/main.ts`

```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/react-vite",
  async viteFinal(config) {
    const { mergeConfig } = await import("vite");
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    const Icons = (await import("unplugin-icons/vite")).default;

    return mergeConfig(config, {
      plugins: [
        tailwindcss(),
        Icons({ compiler: "jsx", jsx: "react", autoInstall: false }),
      ],
      resolve: {
        alias: {
          "@": path.resolve(dirname, "../src"),
        },
      },
    });
  },
};

export default config;
```

> **Research Insights**:
> - **`mergeConfig` 사용**: `config.plugins?.push()` 대신 Vite 공식 `mergeConfig`로 안전하게 병합한다.
> - **Dynamic import**: Tailwind v4 플러그인은 `await import()`로 로드해야 CJS 호환성 경고를 방지한다.
> - **`@/` 경로 별칭 필수**: 컴포넌트가 `@/contexts`, `@/lib/utils` 등을 사용한다. 이 설정 없이는 모든 컴포넌트가 import 해석에 실패한다.
> - **`autoInstall: false`**: 네트워크 요청 방지, 결정론적 빌드 보장. `@iconify-json/lucide`가 이미 설치되어 있으므로 자동 설치 불필요.
> - **React 플러그인 미추가**: `@storybook/react-vite`가 자동 제공하므로 중복 등록 시 에러 발생.
> - **`tanstackRouter`, `dts`, `copy-styles` 미추가**: demo/빌드 전용 플러그인이므로 Storybook에서 불필요.

#### 1-4. `.storybook/preview.tsx` 생성

**파일**: `modules/react-components/.storybook/preview.tsx`

```tsx
import type { Preview } from "@storybook/react-vite";
import { Agentation } from "agentation";
import { SonamuProvider } from "../src/contexts/sonamu-context";
import "../src/styles/globals.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <SonamuProvider>
        <Story />
        <Agentation endpoint="http://localhost:4747" />
      </SonamuProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
```

> **Research Insights**:
> - **mockUploader 제거**: 초기 스토리 대상에 FileInput이 없으므로 불필요. 또한 원래 플랜의 mockUploader에 타입 버그가 있었음 (`SonamuFile`은 `{ name, mime_type }`인데 `{ filename, mimetype }`으로 작성). SonamuProvider는 props 없이도 동작함 (SD는 영어 fallback, uploader는 미호출 시 문제 없음).
> - **`auth` 미전달**: `authOptions` 없으면 auth 클라이언트 생성을 건너뜀 (`useRef`로 보호).
> - **Decorator 실행 순서**: global -> component -> story 순서이며, 렌더링은 안쪽에서 바깥쪽으로.

#### 1-5. vite-plugin-dts 제외 설정

**파일**: `modules/react-components/vite.config.ts`

```typescript
dts({
  rollupTypes: true,
  tsconfigPath: "./tsconfig.json",
  exclude: ["**/*.stories.tsx", "**/*.stories.ts"],
})
```

> **Research Insight**: rollup은 `build.lib.entry`에서 도달 가능한 파일만 번들링하므로 JS 번들에는 자동 제외되지만, `vite-plugin-dts`는 `entryRoot: "src"` 기준으로 모든 TSX를 대상으로 하므로 명시적 제외가 필수.

#### 1-6. `.gitignore`에 `storybook-static/` 추가

**파일**: `modules/react-components/.gitignore` (또는 루트 `.gitignore`)

```
storybook-static/
```

#### 1-7. Button baseline 스토리

**파일**: `modules/react-components/src/components/ui/button.stories.tsx`

검증 항목:
- Tailwind v4 CSS 변수 로딩 (색상, 반경, 폰트)
- unplugin-icons (`~icons/lucide/loader`) 렌더링
- CVA variants/sizes Controls 탐색
- Agentation 오버레이 표시
- SonamuProvider context 정상 주입
- `pnpm build` 시 dist/에 stories 미포함 확인

스토리 구성:
- `Default`: 기본 버튼
- `Variants`: variant별 렌더링 (모든 variant를 나열하는 render 함수)
- `Sizes`: size별 렌더링

> **Research Insights**:
> - **CVA argTypes 수동 지정**: CVA는 런타임 유틸리티이므로 Storybook이 variant를 자동 감지 못함. `argTypes`에서 `variant`, `size`를 `control: 'select'`로 명시.
> - **`satisfies Meta<typeof Button>`** 패턴 사용 (not `as const satisfies`).
> - **Storybook 10 import 경로**: `import type { Meta, StoryObj } from "@storybook/react-vite"`.

```tsx
// 예시 구조
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta = {
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["xs", "sm", "default", "lg", "xl"],
    },
  },
  args: {
    children: "Button",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      {["default", "destructive", "outline", "secondary", "ghost", "link"].map((v) => (
        <Button key={v} {...args} variant={v as typeof args.variant}>
          {v}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      {["xs", "sm", "default", "lg", "xl"].map((s) => (
        <Button key={s} {...args} size={s as typeof args.size}>
          {s}
        </Button>
      ))}
    </div>
  ),
};
```

**Phase 1 커밋 후 검증**:
- [ ] `pnpm storybook`: Storybook 개발 서버 6006 포트에서 기동
- [ ] Button 3개 스토리 렌더링 확인
- [ ] `pnpm build`: dist/에 stories 미포함 확인
- [ ] `pnpm build-storybook`: 정적 빌드 성공

### Phase 2: 나머지 컴포넌트 스토리

Phase 1에서 파이프라인이 검증되면, 나머지 컴포넌트 스토리를 일괄 작성한다.

#### 2-1. Input

**파일**: `modules/react-components/src/components/ui/input.stories.tsx`

- `useState`로 상태 관리 (useArgs의 text input 커서 점프 이슈 회피)
- `onValueChange` 콜백 연동
- 스토리: `Default` (value + onChange), `Disabled`

> **Research Insight**: `useArgs`는 text input에서 커서가 끝으로 점프하는 알려진 이슈가 있음. 비동기 업데이트가 React의 동기 이벤트 체인을 깨뜨리기 때문. text input은 `useState` 사용, select/checkbox 등은 `useArgs` 사용이 최적.

```tsx
// Input은 useState 패턴 사용
export const Default: Story = {
  render: function Render(args) {
    const [value, setValue] = useState("");
    return (
      <Input
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onValueChange={(v) => setValue(v)}
      />
    );
  },
};
```

#### 2-2. Select

**파일**: `modules/react-components/src/components/ui/select/select.stories.tsx`

- `useArgs`로 `value` 양방향 바인딩 (select는 커서 점프 이슈 없음)
- 스토리: `SingleSync`, `MultiSync`

> **Research Insights**:
> - **제네릭 타입 처리**: `satisfies Meta<SelectProps<string>>` 패턴으로 구체적 타입 파라미터 지정. `typeof Select`는 forwardRef + 타입 단언으로 제네릭이 소거되므로 Props 타입을 직접 전달.
> - **`render` 함수 선언식**: `render: function Render(args) { ... }` 형태 사용. Arrow function은 ESLint `react-hooks/rules-of-hooks` 규칙 위반 가능.
> - **`useArgs` import 경로**: `import { useArgs } from "storybook/preview-api"` (Storybook 10, `@storybook/preview-api`가 아님).

#### 2-3. Dialog

**파일**: `modules/react-components/src/components/ui/dialog.stories.tsx`

- Compound 컴포넌트이므로 `render`에서 전체 구조 조립 필요
- 스토리: `Default` (open/close 트리거)

> **Research Insight**: Portal 기반 컴포넌트의 play 함수에서는 `within(canvasElement)` 대신 `within(canvasElement.ownerDocument.body)`를 사용해야 portal로 렌더링된 DOM을 찾을 수 있음.

#### 2-4. Sheet

**파일**: `modules/react-components/src/components/ui/sheet.stories.tsx`

- `argTypes`에서 `side` 옵션 (`top`, `bottom`, `left`, `right`)을 radio control로 제공
- 스토리: `Default`

#### 2-5. Tabs

**파일**: `modules/react-components/src/components/ui/tabs.stories.tsx`

- 단순 합성 컴포넌트
- 스토리: `Default`

**Phase 2 커밋 후 검증**:
- [ ] 5개 컴포넌트 스토리 전부 렌더링 확인
- [ ] Input의 타이핑이 정상 (커서 점프 없음)
- [ ] Select의 값 변경이 Controls에 반영
- [ ] Dialog/Sheet의 open/close 정상 동작

### Phase 3: 빌드 검증 및 정리

- [ ] `pnpm --filter @sonamu-kit/react-components build`: stories가 dist/에 미포함 확인
- [ ] `pnpm --filter @sonamu-kit/react-components lint`: stories 파일 린트 통과
- [ ] `pnpm check`: Biome 통과
- [ ] `pnpm --filter @sonamu-kit/react-components storybook`: 개발 서버 정상 기동
- [ ] `pnpm --filter @sonamu-kit/react-components build-storybook`: 정적 빌드 성공
- [ ] 기존 demo/ 앱 정상 동작 확인 (`pnpm dev`)

## Technical Considerations

### Storybook 10 Import 경로 정리

| 용도 | Import 경로 |
|---|---|
| `Preview`, `Meta`, `StoryObj` 타입 | `@storybook/react-vite` |
| `useArgs` 훅 | `storybook/preview-api` |
| `expect`, `fn`, `userEvent`, `within` | `storybook/test` |

### viteFinal 플러그인 분류

| 기존 vite.config.ts 플러그인 | Storybook viteFinal | 이유 |
|---|---|---|
| `react()` | 미추가 | `@storybook/react-vite`가 자동 제공 |
| `tailwindcss()` | 추가 | CSS 처리 필수 |
| `Icons()` | 추가 | `~icons/*` 가상 모듈 해석 필수 |
| `tanstackRouter()` | 미추가 | demo 전용, Storybook에서 에러 유발 |
| `dts()` | 미추가 | 라이브러리 빌드 전용 |
| `copy-styles` | 미추가 | dist 복사 전용 |

### `@/` 경로 별칭

컴포넌트가 `@/contexts/sonamu-context`, `@/lib/utils` 등을 import한다. `viteFinal`의 `resolve.alias`에서 `@` -> `../src`로 매핑하지 않으면 모든 컴포넌트가 import 해석에 실패한다.

### unplugin-icons `autoInstall: false`

현재 `@iconify-json/lucide`(또는 `@iconify/json`)가 이미 설치되어 있다. `autoInstall: true`는 네트워크 요청을 유발할 수 있고 빌드의 결정론성을 해친다. `autoInstall: false`로 설정하여 이미 설치된 아이콘 패키지만 사용한다.

### Select 제네릭 타입

`Select<Item>`은 `forwardRef` + 타입 단언으로 제네릭을 유지한다. Storybook의 `Meta<typeof Select>`는 제네릭이 소거되므로, `Meta<SelectProps<string>>`처럼 구체적 Props 타입을 직접 전달한다. `as any`는 사용하지 않는다.

### useArgs vs useState 선택 기준

| 컴포넌트 유형 | 패턴 | 이유 |
|---|---|---|
| Select, Checkbox, Toggle | `useArgs` | Controls 양방향 동기화, 커서 점프 이슈 없음 |
| Input, Textarea | `useState` | text input에서 `useArgs`의 비동기 업데이트가 커서 점프 유발 |

### CVA argTypes

CVA는 런타임 유틸리티이므로 Storybook의 정적 분석(react-docgen)이 variant를 자동 감지하지 못한다. `argTypes`에서 `control: 'select'` + `options`를 수동으로 지정해야 한다.

### Portal 기반 컴포넌트 테스트

Dialog, Sheet, Select 등 Radix UI 기반 컴포넌트는 portal로 렌더링된다. `play` 함수에서 DOM을 검색할 때 `within(canvasElement)` 대신 `within(canvasElement.ownerDocument.body)`를 사용해야 한다.

### Tailwind v4 `@source` 디렉티브

`globals.css`의 `@source` 디렉티브가 상대 경로(`../components/**/*.tsx`)로 설정되어 있다. 이 경로는 CSS 파일 위치 기준으로 해석되므로 Storybook에서도 정상 작동이 기대되지만, Phase 1에서 실제 검증한다.

### 외부 CDN 의존성

`globals.css`가 Pretendard 폰트를 CDN에서 로드한다. 오프라인 환경에서는 폰트 로딩이 실패하지만 기능에는 영향 없다.

## Acceptance Criteria

- [ ] `pnpm storybook`으로 Storybook 개발 서버가 6006 포트에서 정상 기동된다.
- [ ] Button, Input, Select, Dialog, Sheet, Tabs 스토리가 렌더링된다.
- [ ] Controls 패널에서 props를 변경하면 컴포넌트에 반영된다.
- [ ] Select에서 값 변경 시 Controls 패널에 역방향으로 반영된다 (useArgs).
- [ ] Agentation 오버레이가 캔버스에 표시된다 (Agentation 서버 실행 시).
- [ ] `pnpm build`로 라이브러리 빌드 시 stories 파일이 dist/에 포함되지 않는다.
- [ ] `build-storybook`으로 정적 빌드가 성공한다.
- [ ] 기존 demo/ 앱이 영향 없이 정상 동작한다.

## Dependencies & Risks

| 리스크 | 영향 | 대응 |
|---|---|---|
| `@/` 경로 별칭 누락 | 모든 컴포넌트 import 실패 | viteFinal `resolve.alias` 설정 (필수) |
| React 플러그인 중복 등록 | Storybook 시작 실패 | viteFinal에서 react() 미추가 |
| Storybook 10 + Tailwind v4 호환 | 스타일 미적용 | dynamic import + mergeConfig 패턴 |
| unplugin-icons 빌드 실패 | 5개 컴포넌트 렌더 불가 | Phase 1에서 조기 검증 |
| useArgs text input 커서 점프 | UX 저하 | Input은 useState 사용 |
| Select 제네릭 타입 추론 실패 | 타입 에러 | Meta<SelectProps<string>> 직접 지정 |
| pnpm 호이스팅 이슈 | 모듈 해석 실패 | clean install 후 Storybook 시작 검증 |
| `@source` 디렉티브 경로 해석 | Tailwind 클래스 미생성 | Phase 1에서 검증, 필요 시 경로 조정 |

## Out of Scope

- 다크 모드 테스트 (후속 작업)
- Vitest interaction 테스트 CI 통합 (후속 작업)
- 전체 62개+ 컴포넌트 스토리 작성 (점진적 추가)
- demo/ 앱 변경 또는 제거
- `@tanstack/react-query` Provider 설정 (IdAsyncSelect 등 후속 대상)
- EnumSelect, SonamuFilter 스토리 (복잡한 mock 필요, 후속 추가)

## References & Research

### Internal References

- Brainstorm: `docs/brainstorms/2026-03-18-storybook-react-components-brainstorm.md`
- Vite 설정: `modules/react-components/vite.config.ts`
- SonamuContext: `modules/react-components/src/contexts/sonamu-context.tsx`
- Select 컴포넌트: `modules/react-components/src/components/ui/select/select.tsx`
- demo mockUploader: `modules/react-components/demo/main.tsx:7-13`
- globals.css: `modules/react-components/src/styles/globals.css`

### External References

- 리서치 구현: `~/Projects/storybook-practice/packages/web/`
- Storybook 10 viteFinal API: https://storybook.js.org/docs/api/main-config/main-config-vite-final
- Storybook + Tailwind v4: https://storybook.js.org/recipes/tailwindcss
- Storybook TypeScript: https://storybook.js.org/docs/writing-stories/typescript
- shadcn-storybook-registry: https://github.com/lloydrichards/shadcn-storybook-registry
- useArgs 커서 점프 이슈: https://sandroroth.com/blog/storybook-controlled-components/
- CVA + Storybook: https://stevekinney.com/courses/storybook/class-variance-authority

### Related Work

- SON-385: @sonamu-kit/react-components에 React web 적용
- SON-399: Agentation과 RN 어떻게 붙이지? 연구 (완료)
- SON-384: 상위 이슈
