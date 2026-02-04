import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectNew,
  Switch,
  useTypeForm,
} from "@sonamu-kit/react-components";
import { useEffect } from "react";
import type { EntityIndex } from "sonamu";
import z from "zod";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronUpIcon from "~icons/lucide/chevron-up";
import { TableColumnAsyncSelect } from "../../components/TableColumnAsyncSelect";

type EntityIndexModalProps = {
  entityId: string;
  table: string;
  oldOne?: EntityIndex;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (data: EntityIndex | null) => void;
};

export function EntityIndexModal({
  entityId,
  table,
  oldOne,
  open,
  onOpenChange,
  onCompleted,
}: EntityIndexModalProps) {
  // TypeForm
  const { form, setForm, register, addError } = useTypeForm(
    z.object({
      type: z.enum(["index", "unique", "hnsw", "ivfflat"]),
      columns: z.array(
        z.object({
          name: z.string(),
          nullsFirst: z.boolean().optional(),
          sortOrder: z.enum(["ASC", "DESC"]).optional(),
        }),
      ),
      name: z.string().min(1).max(63),
      using: z.enum(["btree", "hash", "gin", "gist", "pgroonga"]).optional(),
      nullsNotDistinct: z.boolean().optional(),
    }),
    {
      type: "index",
      name: "",
      columns: [],
      ...oldOne,
    },
  );

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Enter":
          if (e.metaKey) {
            handleSubmit();
            return;
          }
      }
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [form]);

  // 타입 및 Using 변경에 따른 상태 동기화 및 제약조건 적용
  useEffect(() => {
    const newForm = { ...form };
    let needsUpdate = false;

    if (form.type === "unique") {
      // Unique 인덱스는 btree만 사용 가능
      if (form.using !== undefined) {
        delete newForm.using;
        needsUpdate = true;
      }
    } else {
      // B-Tree가 아닌 경우 정렬 옵션 제거
      if (form.using !== "btree" && form.using !== undefined) {
        const hasSortOptions = form.columns.some(
          (col) => col.sortOrder !== undefined || col.nullsFirst !== undefined,
        );
        if (hasSortOptions) {
          newForm.columns = form.columns.map(({ name }) => ({ name }));
          needsUpdate = true;
        }
      }

      // Hash 인덱스는 단일 컬럼만 지원
      if (form.using === "hash" && form.columns.length > 1) {
        newForm.columns = [form.columns[0]];
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      setForm(newForm);
    }
  }, [form.using, form.type, form.columns]);

  // 인덱스 이름 자동 생성
  useEffect(() => {
    if (!oldOne && form.columns.length > 0) {
      const colNames = form.columns.map((col) => col.name).join("_");
      const indexName = `${table}_${colNames}_${form.type}`;

      // 이름이 실제로 변경될 때만 업데이트하여 불필요한 렌더링 방지
      if (form.name !== indexName) {
        setForm((prev) => ({ ...prev, name: indexName }));
      }
    }
  }, [form.type, form.columns, table, oldOne, form.name, setForm]);

  const handleSubmit = () => {
    let hasError = false;

    if (!form.name) {
      addError("name", { content: "Name is required.", pointing: "above" });
      hasError = true;
    } else if (form.name.length > 63) {
      addError("name", { content: "인덱스명은 최대 63byte입니다.", pointing: "above" });
      hasError = true;
    }

    if (form.columns.length === 0) {
      addError("columns", { content: "최소 하나의 컬럼을 선택해야 합니다.", pointing: "above" });
      hasError = true;
    }

    if (form.using === "hash" && form.columns.length > 1) {
      addError("columns", { content: "Hash 인덱스는 단일 컬럼만 지원합니다.", pointing: "above" });
      hasError = true;
    }

    if (!hasError) {
      if (onCompleted) {
        onCompleted(form);
      }
      onOpenChange(false);
    }
  };

  const handleColumnChange = (_: React.FormEvent, { value }: { value: string[] }) => {
    console.log("handleColumnChange", value);
    const newColumns = value.map((name) => {
      const existing = form.columns.find((c) => c.name === name);
      return existing ?? { name };
    });
    setForm({ ...form, columns: newColumns });
  };

  const updateColumn = (index: number, changes: Partial<(typeof form.columns)[0]>) => {
    const newColumns = [...form.columns];
    // 값이 없으면(빈 문자열 등) 해당 키 삭제, 아니면 업데이트
    const updatedCol = { ...newColumns[index], ...changes };

    Object.keys(changes).forEach((key) => {
      if (changes[key as keyof typeof changes] === undefined) {
        delete updatedCol[key as keyof typeof updatedCol];
      }
    });

    newColumns[index] = updatedCol;
    setForm({ ...form, columns: newColumns });
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    if (index + direction < 0 || index + direction >= form.columns.length) return;
    const newColumns = [...form.columns];
    [newColumns[index], newColumns[index + direction]] = [
      newColumns[index + direction],
      newColumns[index],
    ];
    setForm({ ...form, columns: newColumns });
  };

  const typeOptions = ["index", "unique", "hnsw", "ivfflat"];
  const usingOptions = [
    { key: "btree", text: "B-Tree" },
    { key: "hash", text: "Hash" },
    { key: "gin", text: "GIN" },
    { key: "gist", text: "GiST" },
    { key: "pgroonga", text: "PGroonga" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-gray-50">
        <DialogHeader className="text-left">
          <DialogTitle>{oldOne ? "Edit Entity Index" : "New Entity Index"}</DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-[#4183c4]">{table}</span> 테이블의 인덱스 설정을
            구성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-scroll flex-1 p-4">
          <form className="block">
            <div className="pt-2">
              {/* Index Name */}
              <div className="mb-[14px]">
                <label className="block mb-1 font-bold">
                  Index Name <span className="text-red-500">*</span>
                  <span className="inline-block px-[0.833em] py-[0.5833em] text-[0.64285714rem] font-bold leading-none rounded-[0.28571429rem] bg-gray-200 text-gray-500 ml-2">
                    자동 생성됨
                  </span>
                </label>
                <Input
                  {...register("name")}
                  className="focus-3"
                  disabled={!!oldOne?.name}
                  placeholder="인덱스 이름이 여기에 표시됩니다"
                />
              </div>

              {/* Type & Option Row */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="mb-[14px]">
                  <label className="block mb-1 font-bold">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <SelectNew
                    value={form.type}
                    onValueChange={(value) =>
                      value && setForm({ ...form, type: value as typeof form.type })
                    }
                    items={typeOptions.map((type) => ({ value: type, label: type.toUpperCase() }))}
                    className="focus-0"
                  />
                </div>

                {form.type === "unique" ? (
                  <div className="mb-[14px]">
                    <label className="block mb-1 font-bold">Nulls Not Distinct</label>
                    <Switch
                      checked={form.nullsNotDistinct ?? false}
                      onCheckedChange={(value) =>
                        setForm({ ...form, nullsNotDistinct: value ? true : undefined })
                      }
                    />
                  </div>
                ) : (
                  <div className="mb-[14px]">
                    <label className="block mb-1 font-bold">Using</label>
                    <SelectNew
                      value={form.using}
                      onValueChange={(value) => {
                        setForm({
                          ...form,
                          using: value as NonNullable<EntityIndex["using"]> | undefined,
                        });
                      }}
                      clearable
                      items={usingOptions.map((opt) => ({ value: opt.key, label: opt.text }))}
                      placeholder="Select using..."
                      className="focus-0"
                    />
                  </div>
                )}
              </div>

              {/* Target Columns Area */}
              <div className="mb-[14px] columns-field">
                <h5 className="text-[1.07142857rem] font-bold my-[calc(2rem-0.14285714em)] mb-4">
                  Target Columns
                </h5>

                <div className="column-select-wrapper">
                  <TableColumnAsyncSelect
                    value={form.columns.map((col) => col.name)}
                    onChange={handleColumnChange}
                    entityId={entityId}
                    className="focus-2"
                    placeholder="Select Columns..."
                  />
                </div>

                {/* 컬럼 상세 설정 리스트 */}
                {form.columns.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {form.columns.map((col, idx) => (
                      <div
                        className="bg-white border border-gray-300 rounded-md px-3 py-2 flex flex-row items-center justify-between transition-shadow hover:shadow-md hover:border-gray-400"
                        key={col.name}
                      >
                        <div className="flex items-center gap-3">
                          <span className="bg-gray-200 text-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-base text-gray-800">{col.name}</span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          {/* B-Tree 정렬 옵션 */}
                          {(form.using === "btree" || !form.using) && (
                            <div className="flex gap-1 shrink-0">
                              <SelectNew
                                value={col.sortOrder}
                                onValueChange={(value) => updateColumn(idx, { sortOrder: value })}
                                clearable
                                items={["ASC", "DESC"] as const}
                                placeholder="Sort"
                                className="tiny w-[100px]"
                              />
                              <SelectNew
                                value={col.nullsFirst === undefined ? "" : String(col.nullsFirst)}
                                onValueChange={(value) =>
                                  updateColumn(idx, {
                                    nullsFirst: value ? value === "true" : undefined,
                                  })
                                }
                                clearable
                                items={[
                                  { value: "true", label: "NULLS FIRST" },
                                  { value: "false", label: "NULLS LAST" },
                                ]}
                                placeholder="Nulls"
                                className="tiny w-[100px]"
                              />
                            </div>
                          )}

                          {/* 순서 변경 버튼 */}
                          {form.columns.length > 1 && (
                            <div className="inline-flex gap-0">
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                disabled={idx === 0}
                                onClick={() => moveColumn(idx, -1)}
                                icon={<ChevronUpIcon />}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                disabled={idx === form.columns.length - 1}
                                onClick={() => moveColumn(idx, 1)}
                                icon={<ChevronDownIcon />}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </form>

          <h5 className="text-[1.07142857rem] font-bold my-[calc(2rem-0.14285714em)] mb-4">
            Debug: Form State
          </h5>
          <div className="bg-[#f3f4f5] p-4 rounded-[0.28571429rem] m-0">
            <pre className="overflow-x-auto text-[11px] leading-[1.4] m-0 text-gray-600">
              {JSON.stringify(form, null, 2)}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" onClick={handleSubmit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
