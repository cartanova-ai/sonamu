# shadcn/ui 컴포넌트 설치 현황

## ✅ 설치 완료 (28개 컴포넌트)

### Form & Input (9개)

- ✅ Button
- ✅ Form
- ✅ Input
- ✅ Textarea
- ✅ Select
- ✅ Checkbox
- ✅ Radio Group
- ✅ Label
- ✅ Switch

### Data Display (7개)

- ✅ Table
- ✅ Card
- ✅ Badge
- ✅ Avatar
- ✅ Separator
- ✅ Skeleton
- ✅ Progress

### Feedback & Overlay (7개)

- ✅ Dialog
- ✅ Alert Dialog
- ✅ Toast + Toaster
- ✅ Tooltip
- ✅ Popover
- ✅ Sheet

### Navigation (2개)

- ✅ Tabs
- ✅ Pagination

### Menus (1개)

- ✅ Dropdown Menu

### Date & Time (1개)

- ✅ Calendar

### Layout (1개)

- ✅ Scroll Area

### Hooks (1개)

- ✅ useToast

## 📦 사용 방법

```typescript
import {
  Button,
  Form,
  Input,
  Select,
  Table,
  Dialog,
  Toast,
} from "@sonamu-kit/react-components/components";

import { useToast } from "@sonamu-kit/react-components/hooks";
```

## 💡 추가 가능한 컴포넌트

필요시 아래 컴포넌트들을 추가로 설치할 수 있습니다:

```bash
cd modules/react-components

# Navigation
npx shadcn@latest add navigation-menu
npx shadcn@latest add menubar
npx shadcn@latest add breadcrumb
npx shadcn@latest add command

# More Components
npx shadcn@latest add accordion
npx shadcn@latest add collapsible
npx shadcn@latest add context-menu
npx shadcn@latest add hover-card
npx shadcn@latest add slider
npx shadcn@latest add date-picker
npx shadcn@latest add toggle
npx shadcn@latest add toggle-group
npx shadcn@latest add aspect-ratio
npx shadcn@latest add resizable
npx shadcn@latest add sonner
npx shadcn@latest add drawer
npx shadcn@latest add carousel
```

## 🎯 다음 단계

1. ✅ shadcn/ui 컴포넌트 추가 완료
2. ⏳ react-hook-form 기반 useTypeForm 구현
3. ⏳ useListParams URL 연동 구현
4. ⏳ tanstack-router 설정
5. ⏳ 실제 Admin 페이지에서 테스트

## 📚 참고

- 공식 문서: https://ui.shadcn.com/docs/components
- 패키지 위치: `/modules/react-components/src/components/ui/`
- Export: `/modules/react-components/src/components/index.ts`
