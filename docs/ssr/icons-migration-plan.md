# 아이콘 시스템 개선 플랜

## 현재 상황

### 문제점
- `@iconify/react`의 런타임 API 호출 (`https://api.iconify.design/lucide.json?icons=...`)
- 문자열 기반 아이콘 참조로 타입 안정성 없음
- 각 페이지마다 개별 래퍼 컴포넌트 정의 (일관성 부족)

### 현재 패턴
```tsx
import { Icon, type IconProps } from "@iconify/react";

const SearchIcon = (props: Omit<IconProps, "icon">) => 
  <Icon icon="lucide:search" {...props} />;

<SearchIcon className="h-5 w-5" />
```

### 사용 현황
- 프로젝트: miomock/web
- 총 26개 페이지
- 약 70개 아이콘 사용
- 현재는 전부 lucide, 일부 mdi

## 목표

### 핵심 해결사항
1. ✅ 런타임 API 호출 제거 → 빌드타임 번들링
2. ✅ 타입 안정성 확보 → Named export
3. ✅ 직접 import → 래퍼 제거

### 비목표
- ❌ 중앙 등록 파일 (icons.tsx) - 실질적 이득 없음
- ❌ Size/Color preset - 아이콘은 컴포지션의 재료일 뿐
- ❌ 커스텀 래퍼 - Raw Tailwind가 더 명확

## 솔루션: unplugin-icons

### 선택 이유
- 빌드타임에 가상 모듈(`~icons/...`)을 실제 React 컴포넌트로 변환
- 여러 아이콘 세트 지원 (lucide, mdi, heroicons 등)
- Named export로 타입 안전성 자동 확보
- Tree-shaking 자동 동작
- SSR 완전 지원 (순수 React 컴포넌트)

### 최종 사용 패턴
```tsx
// 각 페이지/컴포넌트에서
import SearchIcon from '~icons/lucide/search'
import ArchiveIcon from '~icons/lucide/archive'
import FormatListIcon from '~icons/mdi/format-list-bulleted'

<SearchIcon className="h-5 w-5 text-gray-600" />
```

## 작업 단계

### Phase 1: 환경 설정

#### 1.1 패키지 설치
```bash
cd examples/miomock/web
npm install -D unplugin-icons @iconify/json
```

**Note**: 
- `unplugin-icons`: 빌드 플러그인
- `@iconify/json`: 모든 아이콘 세트 데이터 (개발 시에만 필요)

#### 1.2 Vite 설정 추가
```ts
// examples/miomock/web/vite.config.ts
import Icons from 'unplugin-icons/vite'

export default defineConfig({
  plugins: [
    // 기존 플러그인들...
    Icons({
      compiler: 'jsx',
      jsx: 'react',
    }),
  ],
})
```

#### 1.3 TypeScript 설정
```json
// examples/miomock/web/tsconfig.json
{
  "compilerOptions": {
    "types": ["unplugin-icons/types/react"]
  }
}
```

#### 1.4 검증
```tsx
// 간단한 테스트 파일 작성
import TestIcon from '~icons/lucide/heart'

function Test() {
  return <TestIcon className="h-10 w-10 text-red-500" />
}
```

빌드 및 개발 서버 실행하여 정상 동작 확인.

### Phase 2: 마이그레이션 전략

#### 2.1 아이콘 사용 현황 파악
```bash
# 현재 사용 중인 모든 아이콘 패턴 검색
grep -r "icon=\"" examples/miomock/web/src --include="*.tsx"
grep -r "Icon icon=" examples/miomock/web/src --include="*.tsx"
```

결과를 정리하여 변환 매핑 테이블 작성:
```
lucide:search → ~icons/lucide/search → SearchIcon
lucide:archive → ~icons/lucide/archive → ArchiveIcon
mdi:format-list-bulleted → ~icons/mdi/format-list-bulleted → FormatListBulletedIcon
```

#### 2.2 점진적 마이그레이션 순서
1. **Sidebar.tsx** (메인 네비게이션) - 영향 범위 크므로 우선 검증
2. **SearchInput.tsx** 류 - 공통 컴포넌트
3. **Admin 페이지들** - 페이지별로 순차 진행

#### 2.3 변환 패턴
```tsx
// Before
import { Icon } from "@iconify/react";
const SearchIcon = (props: Omit<IconProps, "icon">) => 
  <Icon icon="lucide:search" {...props} />;

// After
import SearchIcon from '~icons/lucide/search'
// 래퍼 정의 제거
```

```tsx
// Before
<SearchIcon className="h-5 w-5" />

// After
<SearchIcon className="h-5 w-5" />
// 사용처는 동일
```

### Phase 3: @sonamu-kit/react-components 처리

#### 3.1 현황
- kit 모듈에서 사용하는 아이콘들도 동일한 문제
- 예: SearchInput, DataTable 등의 내부 아이콘

#### 3.2 접근 방법
```tsx
// @sonamu-kit/react-components의 컴포넌트들도 동일하게
import SearchIcon from '~icons/lucide/search'

// kit를 사용하는 프로젝트에서도 unplugin-icons 필요
// → 이건 kit의 peerDependencies 또는 문서화 필요
```

#### 3.3 문서화
kit README에 다음 추가:
```md
## Requirements

This package uses `unplugin-icons` for icon management. 
Add to your vite.config.ts:

\`\`\`ts
import Icons from 'unplugin-icons/vite'

export default {
  plugins: [Icons({ compiler: 'jsx', jsx: 'react' })]
}
\`\`\`
```

### Phase 4: 정리 및 검증

#### 4.1 @iconify/react 제거
```bash
npm uninstall @iconify/react
```

#### 4.2 검증 체크리스트
- [ ] 개발 서버 정상 실행
- [ ] 모든 페이지에서 아이콘 정상 렌더링
- [ ] 프로덕션 빌드 성공
- [ ] 번들 사이즈 확인 (70개 아이콘만 포함되는지)
- [ ] SSR 동작 확인

#### 4.3 번들 사이즈 검증
```bash
npm run build
# dist 폴더의 크기 비교
# 네트워크 탭에서 iconify API 호출이 없는지 확인
```

## 예상 결과

### Before
```
- 런타임 API 호출: O
- 타입 안정성: X
- 번들 사이즈: 작지만 런타임 오버헤드
- 일관성: 각 페이지마다 래퍼 정의
```

### After
```
- 런타임 API 호출: X (빌드타임 번들링)
- 타입 안정성: O (Named import)
- 번들 사이즈: 70개 아이콘만 포함 (tree-shaking)
- 일관성: 직접 import로 명확한 패턴
```

## 주의사항

### 1. 아이콘 이름 매핑
- iconify의 `lucide:search` → unplugin-icons의 `~icons/lucide/search`
- kebab-case로 통일됨
- 예: `format-list-bulleted` (not `formatListBulleted`)

### 2. Props 타입
```tsx
import type { SVGProps } from 'react'

// unplugin-icons 아이콘은 기본적으로
type IconComponent = React.FC<SVGProps<SVGSVGElement>>
```

### 3. SSR 고려사항
- 이미 순수 React 컴포넌트로 변환되므로 SSR 이슈 없음
- 서버/클라이언트 모두에서 동일하게 동작

### 4. 새 아이콘 추가 프로세스
```tsx
// 1. 아이콘 찾기: https://icon-sets.iconify.design/
// 2. Import: import NewIcon from '~icons/[set]/[name]'
// 3. 사용: <NewIcon className="..." />
```

## 다음 단계

1. Phase 1 환경 설정 완료 후 검증
2. Sidebar.tsx 1개 파일만 먼저 마이그레이션하여 패턴 확정
3. 나머지 파일들 일괄 변환
4. @sonamu-kit/react-components 적용
5. 문서화 및 팀 공유

## 참고 자료

- [unplugin-icons 공식 문서](https://github.com/unplugin/unplugin-icons)
- [Iconify 아이콘 검색](https://icon-sets.iconify.design/)
- [Lucide Icons](https://lucide.dev/)
