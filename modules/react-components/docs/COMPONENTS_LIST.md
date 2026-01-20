# shadcn/ui 컴포넌트 전체 리스트

## ✅ 현재 추가된 컴포넌트 (48개)

### Form & Input (12개)

- ✅ Button
- ✅ Form
- ✅ Input
- ✅ Textarea
- ✅ Select
- ✅ Checkbox
- ✅ Radio Group
- ✅ Label
- ✅ Switch
- ✅ Slider
- ✅ Input OTP
- ✅ Combobox

### Data Display (7개)

- ✅ Table
- ✅ Card
- ✅ Badge
- ✅ Avatar
- ✅ Separator
- ✅ Skeleton
- ✅ Progress

### Feedback & Overlay (10개)

- ✅ Dialog
- ✅ Alert Dialog
- ✅ Alert
- ✅ Toast + Toaster
- ✅ Tooltip
- ✅ Popover
- ✅ Sheet
- ✅ Hover Card
- ✅ Drawer

### Navigation (6개)

- ✅ Tabs
- ✅ Pagination
- ✅ Navigation Menu
- ✅ Menubar
- ✅ Breadcrumb
- ✅ Command

### Menus (2개)

- ✅ Dropdown Menu
- ✅ Context Menu

### Date & Time (2개)

- ✅ Calendar
- ✅ Date Picker

### Layout (5개)

- ✅ Scroll Area
- ✅ Accordion
- ✅ Collapsible
- ✅ Resizable
- ✅ Aspect Ratio

### Other (4개)

- ✅ Carousel
- ✅ Toggle
- ✅ Toggle Group
- ✅ Sonner (미사용 - drawer, toast 사용 권장)

---

## 🎯 필요시 추가 가능한 컴포넌트

**모든 필수 컴포넌트가 설치 완료되었습니다!** 🎉

추가로 필요한 컴포넌트가 있으면 [shadcn/ui 공식 문서](https://ui.shadcn.com/docs/components)를 참고하세요.

---

## 💡 새 컴포넌트 추가 시 주의사항

추가 컴포넌트를 설치할 때:

```bash
cd packages/react-components
npx shadcn@latest add [컴포넌트명] --yes
```

**설치 후 필수 작업:**

1. 컴포넌트 파일에서 `@/lib/utils` → `../../lib/utils` 경로 수정
2. 다른 컴포넌트 import도 `@/components/ui/xxx` → `./xxx` 상대 경로로 수정
3. `src/components/index.ts`에 export 추가

## 📚 참고

- 공식 문서: https://ui.shadcn.com/docs/components
- 모든 컴포넌트는 소스 코드로 추가되어 자유롭게 커스터마이징 가능
- TypeScript 완벽 지원
- Radix UI 기반으로 접근성(a11y) 우수
