import { type Meta, type StoryObj } from "@storybook/react-vite";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useState } from "react";

import { type AsyncIdConfig, IdAsyncSelect, type IdAsyncSelectProps } from "./id-async-select";

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
  if (params?.keyword !== undefined && params.keyword.length > 0) {
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
// 실제 useQuery / useInfiniteQuery 결과를 그대로 반환해 생성 서비스와 같은
// 캐시 및 로딩 전이를 재현합니다.
// ----------------------------------------------------------------------------

// queryKey 규약(IdAsyncSelect 내부 predicate와 맞춤):
//   ["mock", "Company", "list" | "infinite", subset, params]
// IdAsyncSelect 는 key[2] === "infinite" && key[3] === subset && key[4] === params
// 로 reset / remove 를 수행하므로, 이 순서를 유지해야 드롭다운 재오픈 · keyword 변경
// 시 fresh 로딩 전이가 실제 그대로 재현됩니다.
const MOCK_QUERY_PREFIX = ["mock", "Company"] as const;

function useMockList(subset: "A", params?: MockListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...MOCK_QUERY_PREFIX, "list", subset, params],
    queryFn: () => fetchMockList(params),
    enabled: options?.enabled ?? true,
  });
}

function useMockListInfinite(
  subset: "A",
  params?: MockListParams,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
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

type MockIdAsyncSelectProps = IdAsyncSelectProps<
  "A",
  MockSubsetMapping,
  number,
  MockListParams,
  "A"
>;

function MockIdAsyncSelect(props: MockIdAsyncSelectProps) {
  return <IdAsyncSelect<"A", MockSubsetMapping, number, MockListParams, "A"> {...props} />;
}

const meta = {
  component: MockIdAsyncSelect,
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
} satisfies Meta<typeof MockIdAsyncSelect>;

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
          onValueChange={(nextValue) => setValue(Array.isArray(nextValue) ? undefined : nextValue)}
          onRowChange={(nextRow) => setRow(Array.isArray(nextRow) ? undefined : nextRow)}
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
          onValueChange={(nextValue) => setValues(Array.isArray(nextValue) ? nextValue : [])}
          onRowChange={(nextRows) => setRows(Array.isArray(nextRows) ? nextRows : [])}
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
