# Dashboard Frontend 인수인계 문서

**Date:** 2026-03-10
**Status:** 백엔드 완료, 프론트엔드 구현 대기
**담당:** 프론트엔드 에이전트

---

## 1. 구현 목표

현재 `/admin/` 인덱스 페이지(플레이스홀더)를 **경영진 대시보드**로 교체한다.

**교체 대상 파일:**

```
/examples/miomock/web/src/routes/admin/index.tsx
```

현재 상태: 유저 정보 카드 + 관리 메뉴 버튼 나열 (플레이스홀더)

---

## 2. API 엔드포인트

### 2-1. GET `/api/dashboard/getStats`

- **응답:** `DashboardStats` (조직/프로젝트/문서 현황 전체)
- **인증:** 불필요 (guards 없음)
- **TanStack Query 리소스명:** `DashboardStats`

### 2-2. GET `/api/dashboard/getRecentActivity`

- **파라미터:** `period: "7" | "30" | "all"` (기본값: "7")
- **응답:** `ActivityGroup[]` (날짜별 그룹핑된 활동 목록)
- **인증:** 컨텍스트의 user.role에 따라 자동 필터링
  - admin → 전체 이력
  - normal → 본인 이력만
- **TanStack Query 리소스명:** `RecentActivity`

### 서비스 hooks (자동 생성 필요)

현재 `services.generated.ts`에 Dashboard 서비스가 **아직 생성되지 않았다**.
`pnpm sonamu sync` 또는 동기화 커맨드를 실행하여 아래 hooks를 자동 생성해야 한다:

```typescript
// 예상되는 생성 패턴
DashboardService.useDashboardStats(options?)
DashboardService.useRecentActivity(period?, options?)
```

만약 자동 생성이 안 되면, 수동으로 axios + queryOptions 패턴으로 작성:

```typescript
import axios from "axios";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { DashboardStats, ActivityGroup, ActivityPeriod } from "./dashboard/dashboard.types";

// getStats
export const getDashboardStatsQueryOptions = () =>
  queryOptions({
    queryKey: ["DashboardStats"],
    queryFn: async () => {
      const { data } = await axios.get<DashboardStats>("/api/dashboard/getStats");
      return data;
    },
  });

// getRecentActivity
export const getRecentActivityQueryOptions = (period: ActivityPeriod = "7") =>
  queryOptions({
    queryKey: ["RecentActivity", period],
    queryFn: async () => {
      const { data } = await axios.get<ActivityGroup[]>("/api/dashboard/getRecentActivity", {
        params: { period },
      });
      return data;
    },
  });
```

---

## 3. 타입 정의

이미 동기화 완료:

```
/examples/miomock/web/src/services/dashboard/dashboard.types.ts
```

### DashboardStats

```typescript
{
  organization: {
    companyCount: number;
    departmentCount: number;
    employeeCount: number;
  }
  projects: {
    statusCounts: {
      planning: number;
      in_progress: number;
      completed: number;
      cancelled: number;
    }
    activeProjects: Array<{
      id: number;
      name: string;
      deadline: Date | null;
      milestoneTotal: number;
      milestoneCompleted: number;
    }>;
  }
  documents: {
    total: number;
    draft: number;
    published: number;
    archived: number;
  }
}
```

### ActivityGroup

```typescript
{
  date: string; // "today" | "yesterday" | "2026-03-08"
  label: string; // "오늘 (3건)" | "어제 (5건)" | "3월 8일 (2건)"
  items: Array<{
    id: number;
    actor_id: string | null;
    action: "create" | "update" | "delete";
    entity_type: string; // "Company" | "Department" | "Employee" | "Project" | "Tag" | "Document"
    entity_id: number;
    created_at: Date;
  }>;
}
```

### ActivityPeriod

```typescript
"7" | "30" | "all";
```

---

## 4. 페이지 레이아웃 상세

4개 섹션을 순서대로 배치한다.

```
┌──────────────────────────────────────────────────┐
│  경영진 대시보드                                    │
│                                                    │
│  ─── 섹션 1: 조직 현황 ──────────────────────────  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 회사  3개 │ │ 부서 12개 │ │ 직원 48명 │          │
│  └──────────┘ └──────────┘ └──────────┘          │
│                                                    │
│  ─── 섹션 2: 프로젝트 현황 ─────────────────────  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│  │기획 5│ │진행 8│ │완료12│ │취소 2│            │
│  └──────┘ └──────┘ └──────┘ └──────┘            │
│                                                    │
│  진행중 프로젝트 TOP 5                              │
│  ┌────────────┬──────────┬────────┐              │
│  │ 이름        │ 마감일    │ 진행률  │              │
│  │ A프로젝트   │ 3/15     │ 3/5    │              │
│  │ B프로젝트   │ 4/01     │ 1/3    │              │
│  │ C프로젝트   │ -        │ 0/0    │              │
│  └────────────┴──────────┴────────┘              │
│                                                    │
│  ─── 섹션 3: 문서 현황 ──────────────────────────  │
│  ┌──────────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ 전체 25개 │ │초안 8│ │발행15│ │보관 2│        │
│  └──────────┘ └──────┘ └──────┘ └──────┘        │
│                                                    │
│  ─── 섹션 4: 최근 활동 ───── [7일|30일|전체] ──   │
│  ── 오늘 (3건) ──                                  │
│  ● 회사 수정 · Company #12 · 2분 전                │
│  ● 부서 생성 · Department #5 · 15분 전             │
│  ── 어제 (5건) ──                                  │
│  ● 직원 삭제 · Employee #3 · 어제                  │
│                                                    │
│                              [더보기 →]             │
└──────────────────────────────────────────────────┘
```

---

## 5. 컴포넌트 상세 기획

### 5-1. 메트릭 카드 (MetricCard)

숫자와 레이블로 구성된 단일 정보 단위.

| Props | 타입      | 설명                          |
| ----- | --------- | ----------------------------- |
| label | string    | 카드 제목 ("회사", "부서" 등) |
| value | number    | 표시할 숫자                   |
| icon? | ReactNode | 아이콘 (선택)                 |

- sonamu-kit의 `Card` 컴포넌트 사용
- 숫자는 크게 (text-2xl font-bold), 레이블은 작게 (text-sm text-muted-foreground)

### 5-2. 프로젝트 상태 카드

4개 상태를 가로 배치. 각 카드에 상태명 + 카운트.

| 상태        | 한국어  | Badge variant     |
| ----------- | ------- | ----------------- |
| planning    | 기획 중 | outline           |
| in_progress | 진행 중 | default (primary) |
| completed   | 완료    | secondary         |
| cancelled   | 취소    | destructive       |

### 5-3. 진행중 프로젝트 TOP 5 테이블

sonamu-kit `Table` 사용.

| 컬럼            | 필드                                | 비고                              |
| --------------- | ----------------------------------- | --------------------------------- |
| 프로젝트명      | name                                | 링크: `/admin/projects/${id}`     |
| 마감일          | deadline                            | null이면 "-" 표시                 |
| 마일스톤 진행률 | milestoneCompleted / milestoneTotal | "3/5" 형식 + 프로그레스 바 (선택) |

- 빈 상태: "진행중인 프로젝트가 없습니다"

### 5-4. 문서 현황 카드

4개 메트릭 카드: 전체, 초안(draft), 발행(published), 보관(archived)

### 5-5. 활동 타임라인

#### 기간 필터 (세그먼트 버튼)

```
[7일] [30일] [전체]
```

- 기본 선택: 7일
- 선택 시 `period` 파라미터 변경 → API 재호출
- `useState`로 관리, queryKey에 포함

#### 날짜 그룹 헤더

- `group.label` 그대로 표시 (예: "오늘 (3건)")
- 구분선 + 굵은 텍스트

#### 활동 항목

각 항목 표시 형식:

```
● [action 뱃지] [entity_type] #[entity_id] · [경과시간]
```

| action | 뱃지 텍스트 | 뱃지 variant |
| ------ | ----------- | ------------ |
| create | 생성        | default      |
| update | 수정        | secondary    |
| delete | 삭제        | destructive  |

경과시간: `created_at`을 현재 시각과 비교하여 상대적 표시

- 1분 미만: "방금 전"
- 1시간 미만: "N분 전"
- 24시간 미만: "N시간 전"
- 그 외: 날짜 표시

#### 더보기 버튼

- 텍스트: "더보기 →"
- 클릭 시: `navigate({ to: "/admin/audit-logs" })`
- 위치: 타임라인 하단 우측 정렬

---

## 6. 빈 상태 (Empty State) 처리

| 상황                | 메시지                               |
| ------------------- | ------------------------------------ |
| 회사/부서/직원 0건  | 카드에 "0" 표시 (별도 메시지 불필요) |
| 진행중 프로젝트 0개 | "진행중인 프로젝트가 없습니다"       |
| 진행중 프로젝트 < 5 | 있는 만큼만 표시                     |
| 문서 0건            | 카드에 "0" 표시                      |
| 활동 로그 0건       | "최근 활동이 없습니다"               |
| 기간 내 활동 0건    | "해당 기간에 활동이 없습니다"        |

---

## 7. 기존 프로젝트 패턴 & 컨벤션

### 라우팅

- 파일: `web/src/routes/admin/index.tsx`
- `createFileRoute("/admin/")` + `component: AdminIndexPage`

### 디자인 시스템

- sonamu-kit 컴포넌트: `Card`, `CardHeader`, `CardContent`, `CardTitle`, `Badge`, `Button`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`
- import 경로: `@sonamu-kit/react-components` 또는 `@sonamu-kit/react-components/components`
- 아이콘: `~icons/lucide/{name}` (unplugin-icons)
- 레이아웃: `container mx-auto p-8`, Card 기반

### i18n

- `SD()` 함수 사용: `import { SD } from "@/i18n/sd.generated"`
- 기존 대시보드 키: `dashboard.title`, `dashboard.welcome` 등
- **새로 추가 필요한 i18n 키:**

```typescript
// ko.ts 추가분
"dashboard.organizationStats": "조직 현황",
"dashboard.projectStats": "프로젝트 현황",
"dashboard.documentStats": "문서 현황",
"dashboard.recentActivity": "최근 활동",
"dashboard.activeProjects": "진행중 프로젝트",
"dashboard.noActiveProjects": "진행중인 프로젝트가 없습니다",
"dashboard.noActivity": "최근 활동이 없습니다",
"dashboard.noActivityInPeriod": "해당 기간에 활동이 없습니다",
"dashboard.viewMore": "더보기",
"dashboard.milestone": "마일스톤",
"dashboard.deadline": "마감일",
"dashboard.period.7": "7일",
"dashboard.period.30": "30일",
"dashboard.period.all": "전체",
"dashboard.status.planning": "기획 중",
"dashboard.status.in_progress": "진행 중",
"dashboard.status.completed": "완료",
"dashboard.status.cancelled": "취소",
"dashboard.status.draft": "초안",
"dashboard.status.published": "발행",
"dashboard.status.archived": "보관",
"dashboard.action.create": "생성",
"dashboard.action.update": "수정",
"dashboard.action.delete": "삭제",
```

### 인증 컨텍스트

```typescript
const { auth } = useSonamuContext();
const session = auth.useSession();
const user = session.data?.user ?? null;
// user.role: "admin" | "normal"
```

### 스타일 토큰

- Primary: indigo (`rgba(94, 105, 209, 1)`)
- Accent: blue (`rgba(93, 133, 255, 1)`)
- Destructive: red (`rgba(239, 68, 68, 1)`)
- Border: `border-border/40`
- Card 그림자: `shadow-sm`
- 전체 컨테이너: `max-w-[1800px] mx-auto p-8`

---

## 8. 참조 파일 목록

| 파일                                                      | 역할                   |
| --------------------------------------------------------- | ---------------------- |
| `api/contract/dashboard/main.contract.json`               | 비즈니스 규칙 SSoT     |
| `api/contract/dashboard/dashboard-stats.spec.json`        | Stats API 스펙         |
| `api/contract/dashboard/activity-timeline.spec.json`      | Timeline API 스펙      |
| `api/src/application/dashboard/dashboard.types.ts`        | 백엔드 타입 원본       |
| `api/src/application/dashboard/dashboard.frame.ts`        | 백엔드 구현            |
| `web/src/services/dashboard/dashboard.types.ts`           | 프론트 타입 (동기화됨) |
| `web/src/routes/admin/index.tsx`                          | **교체 대상**          |
| `web/src/routes/admin/audit-logs/index.tsx`               | 참조: 기존 페이지 패턴 |
| `web/src/components/Sidebar.tsx`                          | 사이드바 (변경 불필요) |
| `api/docs/brainstorms/2026-03-10-dashboard-brainstorm.md` | 브레인스토밍 기록      |

---

## 9. 체크리스트

- [ ] `pnpm sonamu sync` 실행하여 Dashboard 서비스 hooks 생성 확인
- [ ] hooks 미생성 시 수동 작성 (섹션 2 참조)
- [ ] `/admin/index.tsx` 교체 구현
- [ ] i18n 키 추가 (ko.ts, en.ts)
- [ ] SD 생성 파일 재생성 (`sd.generated.ts`)
- [ ] 빈 상태 처리 확인
- [ ] 기간 필터 동작 확인
- [ ] "더보기" → `/admin/audit-logs` 이동 확인
- [ ] 빌드 확인
