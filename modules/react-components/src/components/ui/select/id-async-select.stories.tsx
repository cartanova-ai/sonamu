import { type Meta, type StoryObj } from "@storybook/react-vite";
import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { type AsyncIdConfig, IdAsyncSelect } from "./id-async-select";

// ----------------------------------------------------------------------------
// Mock data source
//
// Storybook 안에서 네트워크를 건드리지 않고 IdAsyncSelect 의 Single / Multi 를
// 모두 시연하기 위한 고정 데이터입니다. sonamu가 생성하는 실제 AsyncIdConfig 는
// TanStack Query 훅을 래핑하므로, 여기서도 동일하게 useQuery / useInfiniteQuery 를
// 호출하여 캐싱 · 로딩 전이 · staleTime 같은 런타임 특성을 그대로 재현합니다.
// ----------------------------------------------------------------------------

type MockRow = { id: number; name: string };
type MockListParams = { keyword?: string; id?: number | number[]; num?: number; page?: number };
type MockListData = { rows: MockRow[]; total: number };
type MockSubsetMapping = { A: MockRow };

const MOCK_ROWS: MockRow[] = [
  { id: 1, name: "카르타노바" },
  { id: 2, name: "소나무" },
  { id: 3, name: "노바아이디" },
  { id: 4, name: "미오목" },
  { id: 5, name: "에이전테이션" },
  { id: 6, name: "코덱스" },
  { id: 7, name: "클로드" },
];

const MOCK_NETWORK_LATENCY_MS = 250;

function filterRows(params?: MockListParams): MockRow[] {
  let rows = MOCK_ROWS;
  if (params?.id !== undefined && params.id !== null) {
    const ids = Array.isArray(params.id) ? params.id : [params.id];
    rows = rows.filter((row) => ids.includes(row.id));
  }
  if (typeof params?.keyword === "string" && params.keyword.length > 0) {
    const kw = params.keyword.toLowerCase();
    rows = rows.filter((row) => row.name.toLowerCase().includes(kw));
  }
  return rows;
}

async function fetchMockList(params?: MockListParams): Promise<MockListData> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_NETWORK_LATENCY_MS));
  const rows = filterRows(params);
  return { rows, total: rows.length };
}

// ----------------------------------------------------------------------------
// useList / useListInfinite mock
//
// 실제 useQuery / useInfiniteQuery 결과를 그대로 돌려주고, AsyncIdConfig 의 선언
// 타입(`UseQueryResult<Record<string, unknown>>`)으로 좁히는 단 한 번의 cast 만
// 각 훅 경계에 둡니다. 이 cast 는 AsyncIdConfig 자체가 `Record<string, unknown>`
// 기반이라 생기는 공변성 제약에서 오는 것이므로, 스토리가 직접 Result 구조를
// 흉내 낼 필요는 없습니다.
// ----------------------------------------------------------------------------

// queryKey 규약(IdAsyncSelect 내부 predicate와 맞춤):
//   ["mock", "Company", "list" | "infinite", subset, params]
// IdAsyncSelect 는 key[2] === "infinite" && key[3] === subset && key[4] === params
// 로 reset / remove 를 수행하므로, 이 순서를 유지해야 드롭다운 재오픈 · keyword 변경
// 시 fresh 로딩 전이가 실제 그대로 재현됩니다.
const MOCK_QUERY_PREFIX = ["mock", "Company"] as const;

function useMockList(
  subset: "A",
  params?: MockListParams,
  options?: { enabled?: boolean },
): UseQueryResult<Record<string, unknown>> {
  const query = useQuery({
    queryKey: [...MOCK_QUERY_PREFIX, "list", subset, params],
    queryFn: () => fetchMockList(params),
    enabled: options?.enabled ?? true,
  });
  return query as unknown as UseQueryResult<Record<string, unknown>>;
}

function useMockListInfinite(
  subset: "A",
  params?: MockListParams,
  options?: { enabled?: boolean },
): UseInfiniteQueryResult<InfiniteData<MockListData> & MockListData, Error> {
  const query = useInfiniteQuery({
    queryKey: [...MOCK_QUERY_PREFIX, "infinite", subset, params],
    queryFn: () => fetchMockList(params),
    enabled: options?.enabled ?? true,
    initialPageParam: 0,
    getNextPageParam: () => undefined,
    select: (data) => ({
      ...data,
      rows: data.pages.flatMap((page) => page.rows),
      total: data.pages[0]?.total ?? 0,
    }),
  });
  return query as unknown as UseInfiniteQueryResult<
    InfiniteData<MockListData> & MockListData,
    Error
  >;
}

const MockCompanyAsyncIdConfig: AsyncIdConfig<"A", MockSubsetMapping, MockListParams> = {
  placeholderKey: "entity.Company",
  useList: useMockList,
  useListInfinite: useMockListInfinite,
};

// IdAsyncSelect 내부가 useQueryClient() 를 호출하므로 QueryClientProvider 가 필요합니다.
// preview.tsx 전역 데코레이터는 건드리지 않고 story 수준에서만 감쌉니다. 스토리 간
// 캐시 공유를 막기 위해 QueryClient 인스턴스는 데코레이터 컴포넌트의 useState 로
// 생성합니다.
function QueryClientDecorator({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta = {
  component: IdAsyncSelect,
  tags: ["autodocs"],
  args: {
    config: MockCompanyAsyncIdConfig,
    subset: "A",
    displayField: "name",
  },
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <QueryClientDecorator>
        <Story />
      </QueryClientDecorator>
    ),
  ],
} satisfies Meta<typeof IdAsyncSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: function Render() {
    const [value, setValue] = useState<number | undefined>(undefined);
    const [row, setRow] = useState<MockRow | undefined>(undefined);

    return (
      <div className="w-80 space-y-3">
        <IdAsyncSelect<"A", MockSubsetMapping, number, MockListParams>
          config={MockCompanyAsyncIdConfig}
          subset="A"
          displayField="name"
          baseListParams={{}}
          preload
          value={value}
          onValueChange={(v) => setValue(v as number | undefined)}
          onRowChange={(r) => setRow(r as MockRow | undefined)}
          placeholder="회사를 검색하세요"
        />
        <div className="rounded border p-2 text-xs">
          <div className="font-semibold">선택된 값 (ID)</div>
          <pre>{value !== undefined ? JSON.stringify(value) : "없음"}</pre>
          <div className="mt-2 font-semibold">선택된 Row</div>
          <pre>{row ? JSON.stringify(row, null, 2) : "없음"}</pre>
        </div>
      </div>
    );
  },
};

export const Multi: Story = {
  render: function Render() {
    const [values, setValues] = useState<number[]>([]);
    const [rows, setRows] = useState<MockRow[]>([]);

    return (
      <div className="w-80 space-y-3">
        <IdAsyncSelect<"A", MockSubsetMapping, number, MockListParams>
          config={MockCompanyAsyncIdConfig}
          subset="A"
          displayField={(r) => r.name}
          baseListParams={{}}
          preload
          multiple
          value={values}
          onValueChange={(v) => setValues((v as number[] | undefined) ?? [])}
          onRowChange={(r) => setRows((r as MockRow[] | undefined) ?? [])}
          placeholder="회사를 검색하세요"
        />
        <div className="rounded border p-2 text-xs">
          <div className="font-semibold">선택된 값 (IDs)</div>
          <pre>{values.length > 0 ? JSON.stringify(values) : "없음"}</pre>
          <div className="mt-2 font-semibold">선택된 Rows</div>
          <pre className="max-h-32 overflow-auto">
            {rows.length > 0 ? JSON.stringify(rows, null, 2) : "없음"}
          </pre>
        </div>
      </div>
    );
  },
};
