# @sonamu-kit/react-components

shadcn/ui + tailwindcss + tanstack-router 통합 패키지

## 디자인 시스템

**Figma Maker 기반 디자인 시스템 적용** 🎨

- **폰트**: Pretendard (프리텐다드)
- **컬러 시스템**: RGBA 기반 CSS 변수
- **다크 모드**: 자동 지원 (`.dark` 클래스)
- **차트**: 10가지 프리셋 컬러 (`chart-1` ~ `chart-10`)
- **사이드바**: 전용 컬러 시스템
- **커스텀 스크롤바**: 브라우저별 최적화

### 주요 CSS 변수

- **Typography**: `--text-2xl`, `--text-xl`, `--text-lg`, `--text-base`, `--text-sm`
- **Colors**: `--primary`, `--secondary`, `--accent`, `--destructive`, `--muted`
- **Radius**: `--radius-button`, `--radius-card`, `--radius-nav`, `--radius-toggle`
- **Chart**: `--chart-1` ~ `--chart-10`
- **Sidebar**: `--sidebar`, `--sidebar-primary`, `--sidebar-accent`

## 구조

```
src/
├── components/    # shadcn/ui 기반 컴포넌트들
├── hooks/         # useTypeForm, useListParams 등 통합 hooks
├── lib/           # 유틸리티 함수들
├── router/        # tanstack-router 설정
└── styles/        # tailwindcss 글로벌 스타일 (Figma Maker 기반)
```

## 설치

```bash
cd packages/react-components
yarn install
```

## 사용

web 프로젝트에서 로컬 패키지로 연결하여 사용

```typescript
import { Button } from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/hooks";
```

## 개발

- `yarn dev`: TypeScript watch 모드
- `yarn build`: 빌드
- `yarn lint`: 린팅

## 향후 계획

이 패키지는 추후 `sonamu/ui`로 이전될 예정입니다.
