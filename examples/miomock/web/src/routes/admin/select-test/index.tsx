import {
  Button,
  Card,
  CardContent,
  CardHeader,
  EnumSelect,
  IdAsyncSelect,
  SelectNew,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import z from "zod";
import {
  CompanyAsyncIdConfig,
  CompanyService,
  EmployeeAsyncIdConfig,
} from "@/services/services.generated";
import { CompanyBaseSchema, type CompanySubsetA } from "@/services/sonamu.generated";
import ListIcon from "~icons/mdi/format-list-bulleted";

export const Route = createFileRoute("/admin/select-test/")({
  head: () => ({
    meta: [
      { title: "SelectNew 테스트" },
      { name: "description", content: "SelectNew 컴포넌트 4가지 모드 테스트" },
    ],
  }),
  component: SelectTestPage,
});

// ============================================================================
// 예시 데이터
// ============================================================================

// 1. Simple string 배열 (과일)
const fruits = ["사과", "바나나", "오렌지", "포도", "딸기", "수박", "메론", "복숭아"];

// 2. Number 배열
const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// 3. 복잡한 객체 배열 (회사) - 실제 API에서 가져옴
type Company = CompanySubsetA;

// ============================================================================
// EnumSelect 예시 데이터
// ============================================================================
const ProjectStatusEnum = z.enum(["active", "done", "pending"]);
type ProjectStatus = z.infer<typeof ProjectStatusEnum>;

const projectStatusLabels: Record<ProjectStatus, string> = {
  active: "진행중",
  done: "완료",
  pending: "대기중",
};

// ============================================================================
// 메인 컴포넌트
// ============================================================================

function SelectTestPage() {
  // ============================================================================
  // Single-Sync (string 배열)
  // ============================================================================
  const singleSyncForm = useTypeForm(z.object({ value: z.string().optional() }), {
    value: "사과",
  });
  const singleSyncProps = singleSyncForm.register("value");

  // ============================================================================
  // Multi-Sync (number 배열)
  // ============================================================================
  const multiSyncForm = useTypeForm(z.object({ value: z.array(z.number()) }), {
    value: [1, 2, 3],
  });
  const multiSyncProps = multiSyncForm.register("value");

  // ============================================================================
  // 추가 테스트: 복잡한 객체 (Company) - 실제 API 사용
  // ============================================================================
  const companyForm = useTypeForm(z.object({ value: CompanyBaseSchema.optional() }), {
    value: undefined,
  });
  const companyProps = companyForm.register("value");
  const [companyOptions, setCompanyOptions] = useState<Company[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<Error | undefined>(undefined);

  const handleCompanySearch = useCallback(async (keyword: string) => {
    setCompanyLoading(true);
    setCompanyError(undefined);
    try {
      const result = await CompanyService.getCompanies("A", {
        keyword,
        num: 100,
        page: 1,
        search: "name",
      });
      setCompanyOptions(result.rows);
    } catch (error) {
      setCompanyError(error as Error);
    } finally {
      setCompanyLoading(false);
    }
  }, []);

  const multiCompanyForm = useTypeForm(z.object({ value: z.array(CompanyBaseSchema) }), {
    value: [],
  });
  const multiCompanyProps = multiCompanyForm.register("value");
  const [multiCompanyOptions, setMultiCompanyOptions] = useState<Company[]>([]);
  const [multiCompanyLoading, setMultiCompanyLoading] = useState(false);
  const [multiCompanyError, setMultiCompanyError] = useState<Error | undefined>(undefined);

  const handleMultiCompanySearch = useCallback(async (keyword: string) => {
    setMultiCompanyLoading(true);
    setMultiCompanyError(undefined);
    try {
      const result = await CompanyService.getCompanies("A", {
        keyword,
        num: 100,
        page: 1,
        search: "name",
      });
      setMultiCompanyOptions(result.rows);
    } catch (error) {
      setMultiCompanyError(error as Error);
    } finally {
      setMultiCompanyLoading(false);
    }
  }, []);

  // ============================================================================
  // EnumSelect Forms
  // ============================================================================
  const enumSingleForm = useTypeForm(z.object({ value: ProjectStatusEnum.optional() }), {
    value: undefined,
  });

  const enumMultiForm = useTypeForm(
    z.object({ value: z.array(z.enum(["active", "done", "pending"])) }),
    { value: ["active"] },
  );

  // ============================================================================
  // IdAsyncSelect Forms
  // ============================================================================
  const idAsyncSingleForm = useTypeForm(z.object({ value: z.number().optional() }), {
    value: undefined,
  });

  const idAsyncMultiForm = useTypeForm(z.object({ value: z.array(z.number()) }), {
    value: [],
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-2">
            <ListIcon className="h-5 w-5" />
            <span className="text-lg font-semibold h-5">SelectNew 컴포넌트 테스트</span>
          </div>

          {/* 설명 */}
          <Card className="border-gray-200">
            <CardHeader>
              <div className="text-sm font-semibold text-gray-900">
                SelectNew 컴포넌트 4가지 모드
              </div>
            </CardHeader>
            <CardContent className="text-xs text-gray-700 space-y-1">
              <div>1. Single-Sync: 단일 선택 + 동기</div>
              <div>2. Single-Async: 단일 선택 + 비동기 검색</div>
              <div>3. Multi-Sync: 다중 선택 + 동기</div>
              <div>4. Multi-Async: 다중 선택 + 비동기 검색</div>
            </CardContent>
          </Card>

          {/* ========== Single 모드 섹션 ========== */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pt-4">
              <div className="h-px flex-1 bg-linear-to-r  from-transparent via-blue-300 to-transparent" />
              <span className="text-sm font-semibold text-blue-900 px-3">Single 모드</span>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-blue-300 to-transparent" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Single-Sync (String 배열) */}
              <Card className="flex flex-col gap-6 rounded-card border border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-blue-900">
                    Single-Sync (String 배열)
                  </div>
                  <div className="text-xs text-blue-700">Radix Select UI - 과일 선택</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SelectNew
                    items={fruits}
                    {...singleSyncProps}
                    placeholder="과일을 선택하세요"
                    className="bg-white"
                  />
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <div className="text-xs font-semibold text-blue-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700">
                      {singleSyncForm.form.value
                        ? JSON.stringify(singleSyncForm.form.value)
                        : "없음"}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant="blue"
                    onClick={() => singleSyncForm.setForm({ value: undefined })}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>

              {/* Single-Async (복잡한 객체 - Company) */}
              <Card className="flex flex-col gap-6 rounded-card border border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-blue-900">
                    Single-Async (복잡한 객체)
                  </div>
                  <div className="text-xs text-blue-700">Company 타입 - 실제 API 사용</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SelectNew
                    items={companyOptions}
                    {...companyProps}
                    placeholder="회사를 검색하세요"
                    async={true}
                    loading={companyLoading}
                    error={companyError}
                    onSearch={handleCompanySearch}
                    searchDebounce={300}
                    valueKey={(company) => String((company as Company).id)}
                    renderItem={(company) => (company as Company).name}
                    className="bg-white"
                  />
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <div className="text-xs font-semibold text-blue-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700">
                      {companyForm.form.value
                        ? JSON.stringify(companyForm.form.value, null, 2)
                        : "없음"}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant="blue"
                    onClick={() => {
                      companyForm.setForm({ value: undefined });
                      setCompanyOptions([]); // 검색 결과도 함께 초기화
                    }}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ========== Multi 모드 섹션 ========== */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pt-4">
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-green-300 to-transparent" />
              <span className="text-sm font-semibold text-green-900 px-3">Multi 모드</span>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-green-300 to-transparent" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Multi-Sync (Number 배열) */}
              <Card className="flex flex-col gap-6 rounded-card border border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-green-900">
                    Multi-Sync (Number 배열)
                  </div>
                  <div className="text-xs text-green-700">Command Popover UI - 숫자 선택</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SelectNew
                    items={numbers}
                    {...multiSyncProps}
                    placeholder="숫자를 선택하세요"
                    clearable={true}
                    multiple={true}
                    maxCount={5}
                    className="bg-white"
                  />
                  <div className="p-3 bg-white rounded border border-green-200">
                    <div className="text-xs font-semibold text-green-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700">
                      {multiSyncForm.form.value.length > 0
                        ? JSON.stringify(multiSyncForm.form.value)
                        : "없음"}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => multiSyncForm.setForm({ value: [] })}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>

              {/* Multi-Async (복잡한 객체 - Company) */}
              <Card className="flex flex-col gap-6 rounded-card border border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-green-900">
                    Multi-Async (복잡한 객체)
                  </div>
                  <div className="text-xs text-green-700">Company 타입 - 실제 API 사용</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SelectNew
                    items={multiCompanyOptions}
                    {...multiCompanyProps}
                    placeholder="회사를 검색하세요"
                    clearable={true}
                    multiple={true}
                    async={true}
                    loading={multiCompanyLoading}
                    error={multiCompanyError}
                    onSearch={handleMultiCompanySearch}
                    searchDebounce={300}
                    maxCount={2}
                    valueKey={(company) => String((company as Company).id)}
                    renderItem={(company) => (company as Company).name}
                    className="bg-white"
                  />
                  <div className="p-3 bg-white rounded border border-green-200">
                    <div className="text-xs font-semibold text-green-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700 max-h-32 overflow-auto">
                      {multiCompanyForm.form.value.length > 0
                        ? JSON.stringify(multiCompanyForm.form.value, null, 2)
                        : "없음"}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      multiCompanyForm.setForm({ value: [] });
                      setMultiCompanyOptions([]); // 검색 결과도 함께 초기화
                    }}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ========== EnumSelect 컴포넌트 ========== */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pt-4">
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-purple-300 to-transparent" />
              <span className="text-sm font-semibold text-purple-900 px-3">
                EnumSelect 컴포넌트
              </span>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-purple-300 to-transparent" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* EnumSelect Single */}
              <Card className="flex flex-col gap-6 rounded-card border border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-purple-900">EnumSelect (Single)</div>
                  <div className="text-xs text-purple-700">Zod Enum - 프로젝트 상태 선택</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <EnumSelect
                    enum={ProjectStatusEnum}
                    labels={projectStatusLabels}
                    {...enumSingleForm.register("value")}
                    placeholder="상태를 선택하세요"
                    className="bg-white"
                  />
                  <div className="p-3 bg-white rounded border border-purple-200">
                    <div className="text-xs font-semibold text-purple-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700">
                      {JSON.stringify(enumSingleForm.form.value)}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant="purple"
                    onClick={() => enumSingleForm.setForm({ value: undefined })}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>

              {/* EnumSelect Multi */}
              <Card className="flex flex-col gap-6 rounded-card border border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-purple-900">EnumSelect (Multi)</div>
                  <div className="text-xs text-purple-700">Zod Enum - 프로젝트 상태 선택</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <EnumSelect
                    enum={ProjectStatusEnum}
                    labels={projectStatusLabels}
                    {...enumMultiForm.register("value")}
                    placeholder="상태를 선택하세요"
                    className="bg-white"
                    multiple={true}
                  />
                  <div className="p-3 bg-white rounded border border-purple-200">
                    <div className="text-xs font-semibold text-purple-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700">
                      {enumMultiForm.form.value.length > 0
                        ? JSON.stringify(enumMultiForm.form.value)
                        : "없음"}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant="purple"
                    onClick={() => enumMultiForm.setForm({ value: [] })}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ========== IdAsyncSelect 컴포넌트 ========== */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pt-4">
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-orange-300 to-transparent" />
              <span className="text-sm font-semibold text-orange-900 px-3">
                IdAsyncSelect 컴포넌트
              </span>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-orange-300 to-transparent" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* IdAsyncSelect Single */}
              <Card className="flex flex-col gap-6 rounded-card border border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-orange-900">
                    IdAsyncSelect (Single)
                  </div>
                  <div className="text-xs text-orange-700">Company(name) 검색</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <IdAsyncSelect
                    config={CompanyAsyncIdConfig}
                    subset="A"
                    displayField="name"
                    {...idAsyncSingleForm.register("value")}
                    placeholder="회사를 검색하세요"
                    className="bg-white"
                  />
                  <div className="p-3 bg-white rounded border border-orange-200">
                    <div className="text-xs font-semibold text-orange-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700">
                      {idAsyncSingleForm.form.value
                        ? JSON.stringify(idAsyncSingleForm.form.value)
                        : "없음"}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant="orange"
                    onClick={() => idAsyncSingleForm.setForm({ value: undefined })}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>

              {/* IdAsyncSelect Multi */}
              <Card className="flex flex-col gap-6 rounded-card border border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-3">
                  <div className="text-sm font-semibold text-orange-900">IdAsyncSelect (Multi)</div>
                  <div className="text-xs text-orange-700">Employee(id) 검색</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <IdAsyncSelect
                    config={EmployeeAsyncIdConfig}
                    subset="A"
                    displayField="id"
                    multiple={true}
                    {...idAsyncMultiForm.register("value")}
                    placeholder="직원을 검색하세요"
                    className="bg-white"
                  />
                  <div className="p-3 bg-white rounded border border-orange-200">
                    <div className="text-xs font-semibold text-orange-900 mb-1">선택된 값:</div>
                    <pre className="text-xs text-gray-700">
                      {idAsyncMultiForm.form.value.length > 0
                        ? JSON.stringify(idAsyncMultiForm.form.value)
                        : "없음"}
                    </pre>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant="orange"
                    onClick={() => idAsyncMultiForm.setForm({ value: [] })}
                  >
                    초기화
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
