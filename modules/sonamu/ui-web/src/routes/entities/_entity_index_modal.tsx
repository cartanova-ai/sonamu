import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  Switch,
  useTypeForm,
} from "@sonamu-kit/react-components";
import { useEffect, useState } from "react";
import { type EntityIndex } from "sonamu";
import { z } from "zod";
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

const entityIndexTypeSchema = z.enum(["index", "unique", "hnsw", "ivfflat"]);
const entityIndexUsingSchema = z.enum(["btree", "hash", "gin", "gist", "pgroonga"]).optional();
const entityIndexFormSchema = z.object({
  type: entityIndexTypeSchema,
  columns: z.array(
    z.object({
      name: z.string(),
      nullsFirst: z.boolean().optional(),
      sortOrder: z.enum(["ASC", "DESC"]).optional(),
      opclass: z.string().min(1).optional(),
    }),
  ),
  name: z.string().min(1).max(63),
  using: entityIndexUsingSchema,
  nullsNotDistinct: z.boolean().optional(),
  m: z.number().int().positive().optional(),
  efConstruction: z.number().int().positive().optional(),
  lists: z.number().int().positive().optional(),
});

type EntityIndexForm = z.infer<typeof entityIndexFormSchema>;

const textOpclassOptionsByUsing = {
  gin: [
    { value: "gin_trgm_ops", label: "gin_trgm_ops" },
    { value: "gin_bigm_ops", label: "gin_bigm_ops" },
  ],
  gist: [{ value: "gist_trgm_ops", label: "gist_trgm_ops" }],
};

const vectorOpclassOptions = [
  { value: "vector_cosine_ops", label: "Cosine Distance" },
  { value: "vector_ip_ops", label: "Inner Product" },
  { value: "vector_l2_ops", label: "L2 Distance" },
];

const vectorOpclassValueSet = new Set(vectorOpclassOptions.map((option) => option.value));
const textOpclassValueSetByUsing = {
  gin: new Set(textOpclassOptionsByUsing.gin.map((option) => option.value)),
  gist: new Set(textOpclassOptionsByUsing.gist.map((option) => option.value)),
};
const knownTextOpclassValueSet = new Set([
  ...textOpclassValueSetByUsing.gin,
  ...textOpclassValueSetByUsing.gist,
]);

type IntegerField = "m" | "efConstruction" | "lists";
type IntegerFieldValues = Record<IntegerField, string>;

function normalizeOpclassValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value.trim());
}

function parseOptionalPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  if (!isPositiveInteger(trimmed)) {
    return undefined;
  }

  return Number(trimmed);
}

function isPgroongaOpclass(value: string): boolean {
  return value.startsWith("pgroonga_");
}

function getCompatibleSubmittedOpclass(
  type: EntityIndexForm["type"],
  using: EntityIndexForm["using"],
  value: string | undefined,
): string | undefined {
  const normalized = normalizeOpclassValue(value);
  if (normalized === undefined) {
    return undefined;
  }

  if (type === "hnsw" || type === "ivfflat") {
    return vectorOpclassValueSet.has(normalized) ? normalized : undefined;
  }

  if (type !== "index" || using === undefined || using === "btree" || using === "hash") {
    return undefined;
  }

  if (vectorOpclassValueSet.has(normalized)) {
    return undefined;
  }

  if (using === "gin" || using === "gist") {
    const allowedKnownOpclasses = textOpclassValueSetByUsing[using];
    if (allowedKnownOpclasses.has(normalized)) {
      return normalized;
    }

    if (isPgroongaOpclass(normalized)) {
      return undefined;
    }

    if (knownTextOpclassValueSet.has(normalized)) {
      return undefined;
    }

    return normalized;
  }

  if (knownTextOpclassValueSet.has(normalized)) {
    return undefined;
  }

  return normalized;
}

function isHashSingleColumnIndex(
  type: EntityIndexForm["type"],
  using: EntityIndexForm["using"],
): boolean {
  return type === "index" && using === "hash";
}

function getSubmittedColumns(
  type: EntityIndexForm["type"],
  using: EntityIndexForm["using"],
  columns: EntityIndexForm["columns"],
): EntityIndexForm["columns"] {
  return isHashSingleColumnIndex(type, using) ? columns.slice(0, 1) : columns;
}

function createInitialForm(oldOne?: EntityIndex): EntityIndexForm {
  return {
    type: oldOne?.type ?? "index",
    name: oldOne?.name ?? "",
    columns:
      oldOne?.columns.map(({ vectorOps, opclass, ...column }) => ({
        ...column,
        opclass: opclass ?? vectorOps,
      })) ?? [],
    using: oldOne?.using,
    nullsNotDistinct: oldOne?.nullsNotDistinct,
    m: oldOne?.m,
    efConstruction: oldOne?.efConstruction,
    lists: oldOne?.lists,
  };
}

function createInitialIntegerFieldValues(oldOne?: EntityIndex) {
  return {
    m: oldOne?.m?.toString() ?? "",
    efConstruction: oldOne?.efConstruction?.toString() ?? "",
    lists: oldOne?.lists?.toString() ?? "",
  };
}

function removeUndefinedColumnValues(
  column: EntityIndexForm["columns"][number],
): EntityIndexForm["columns"][number] {
  const { nullsFirst, sortOrder, opclass, ...requiredValues } = column;
  const result: EntityIndexForm["columns"][number] = requiredValues;
  if (nullsFirst !== undefined) result.nullsFirst = nullsFirst;
  if (sortOrder !== undefined) result.sortOrder = sortOrder;
  if (opclass !== undefined) result.opclass = opclass;
  return result;
}

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
    entityIndexFormSchema,
    createInitialForm(oldOne),
  );
  const [integerFieldValues, setIntegerFieldValues] = useState<IntegerFieldValues>(() =>
    createInitialIntegerFieldValues(oldOne),
  );
  const integerFieldSource = `${oldOne?.m ?? ""}:${oldOne?.efConstruction ?? ""}:${oldOne?.lists ?? ""}`;
  const [previousIntegerFieldSource, setPreviousIntegerFieldSource] = useState(integerFieldSource);
  if (previousIntegerFieldSource !== integerFieldSource) {
    setPreviousIntegerFieldSource(integerFieldSource);
    setIntegerFieldValues(createInitialIntegerFieldValues(oldOne));
  }

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

  const isUniqueIndex = form.type === "unique";
  const isVectorIndex = form.type === "hnsw" || form.type === "ivfflat";
  const showsUsingControl = form.type === "index";
  const showsSortControls =
    form.type === "unique" ||
    (form.type === "index" && (form.using === undefined || form.using === "btree"));
  const showsTextOpclassControls =
    form.type === "index" && (form.using === "gin" || form.using === "gist");
  const knownTextOpclassOptions = showsTextOpclassControls
    ? form.using === "gin"
      ? textOpclassOptionsByUsing.gin
      : textOpclassOptionsByUsing.gist
    : [];

  function handleSubmit() {
    let hasError = false;
    const validatedIntegerFields: Partial<Record<IntegerField, number>> = {};
    const submittedColumns = getSubmittedColumns(form.type, form.using, form.columns);

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

    if (isHashSingleColumnIndex(form.type, form.using) && form.columns.length > 1) {
      addError("columns", { content: "Hash 인덱스는 단일 컬럼만 지원합니다.", pointing: "above" });
      hasError = true;
    }

    const requiredIntegerFields: Array<{ field: IntegerField; label: string }> =
      form.type === "hnsw"
        ? [
            { field: "m", label: "M" },
            { field: "efConstruction", label: "EF Construction" },
          ]
        : form.type === "ivfflat"
          ? [{ field: "lists", label: "Lists" }]
          : [];

    requiredIntegerFields.forEach(({ field, label }) => {
      const rawValue = integerFieldValues[field];
      const parsedValue = parseOptionalPositiveInteger(rawValue);

      if (rawValue.trim() !== "" && parsedValue === undefined) {
        addError(field, { content: `${label}는 양의 정수만 허용합니다.`, pointing: "above" });
        hasError = true;
        return;
      }

      if (parsedValue !== undefined) {
        validatedIntegerFields[field] = parsedValue;
      }
    });

    if (!hasError) {
      const payload: EntityIndex = {
        type: form.type,
        name: form.name,
        columns: submittedColumns.map((column) => {
          const nextColumn: EntityIndex["columns"][number] = { name: column.name };
          const opclass = getCompatibleSubmittedOpclass(form.type, form.using, column.opclass);

          if (showsSortControls) {
            if (column.sortOrder !== undefined) {
              nextColumn.sortOrder = column.sortOrder;
            }
            if (column.nullsFirst !== undefined) {
              nextColumn.nullsFirst = column.nullsFirst;
            }
          }

          if (opclass !== undefined) {
            nextColumn.opclass = opclass;
          }

          return nextColumn;
        }),
      };

      if (showsUsingControl && form.using !== undefined) {
        payload.using = form.using;
      }

      if (isUniqueIndex && form.nullsNotDistinct !== undefined) {
        payload.nullsNotDistinct = form.nullsNotDistinct;
      }

      if (form.type === "hnsw") {
        if (validatedIntegerFields.m !== undefined) {
          payload.m = validatedIntegerFields.m;
        }
        if (validatedIntegerFields.efConstruction !== undefined) {
          payload.efConstruction = validatedIntegerFields.efConstruction;
        }
      }

      if (form.type === "ivfflat" && validatedIntegerFields.lists !== undefined) {
        payload.lists = validatedIntegerFields.lists;
      }

      if (onCompleted) {
        onCompleted(payload);
      }
      onOpenChange(false);
    }
  }

  const handleColumnChange = (_: React.FormEvent, { value }: { value: string[] }) => {
    setForm((prev) => {
      const newColumns = value.map((name) => {
        const existing = prev.columns.find((column) => column.name === name);
        return existing ?? { name };
      });

      return { ...prev, columns: newColumns };
    });
  };

  const updateColumn = (index: number, changes: Partial<EntityIndexForm["columns"][number]>) => {
    setForm((prev) => {
      const newColumns = [...prev.columns];
      const updatedCol = removeUndefinedColumnValues({ ...newColumns[index], ...changes });

      newColumns[index] = updatedCol;
      return { ...prev, columns: newColumns };
    });
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    setForm((prev) => {
      if (index + direction < 0 || index + direction >= prev.columns.length) {
        return prev;
      }

      const newColumns = [...prev.columns];
      [newColumns[index], newColumns[index + direction]] = [
        newColumns[index + direction],
        newColumns[index],
      ];

      return { ...prev, columns: newColumns };
    });
  };

  const updateIntegerField = (field: IntegerField, value: string) => {
    setIntegerFieldValues((prev) => ({
      ...prev,
      [field]: value,
    }));
    setForm((prev) => ({
      ...prev,
      [field]: parseOptionalPositiveInteger(value),
    }));
  };

  const typeOptions = entityIndexTypeSchema.options;
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
              <div className={`grid gap-6 mb-6 ${isVectorIndex ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className="mb-[14px]">
                  <label className="block mb-1 font-bold">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={form.type}
                    onValueChange={(value) => {
                      const parsed = entityIndexTypeSchema.safeParse(value);
                      if (parsed.success) setForm({ ...form, type: parsed.data });
                    }}
                    items={typeOptions.map((type) => ({ value: type, label: type.toUpperCase() }))}
                    className="focus-0"
                  />
                </div>

                {isUniqueIndex ? (
                  <div className="mb-[14px]">
                    <label className="block mb-1 font-bold">Nulls Not Distinct</label>
                    <Switch
                      checked={form.nullsNotDistinct ?? false}
                      onCheckedChange={(value) =>
                        setForm({ ...form, nullsNotDistinct: value ? true : undefined })
                      }
                    />
                  </div>
                ) : showsUsingControl ? (
                  <div className="mb-[14px]">
                    <label className="block mb-1 font-bold">Using</label>
                    <Select
                      value={form.using}
                      onValueChange={(value) => {
                        const parsed = entityIndexUsingSchema.safeParse(value);
                        if (parsed.success) setForm({ ...form, using: parsed.data });
                      }}
                      clearable
                      items={usingOptions.map((opt) => ({ value: opt.key, label: opt.text }))}
                      placeholder="Select using..."
                      className="focus-0"
                    />
                  </div>
                ) : null}
              </div>

              {form.type === "hnsw" && (
                <div className="mb-6 rounded-md border border-gray-200 bg-white p-4">
                  <h5 className="text-sm font-bold mb-4">HNSW Options</h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 font-bold">M</label>
                      <Input
                        type="number"
                        min={1}
                        value={integerFieldValues.m}
                        onValueChange={(value) => updateIntegerField("m", value)}
                        placeholder="16"
                        className="focus-0"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold">EF Construction</label>
                      <Input
                        type="number"
                        min={1}
                        value={integerFieldValues.efConstruction}
                        onValueChange={(value) => updateIntegerField("efConstruction", value)}
                        placeholder="64"
                        className="focus-0"
                      />
                    </div>
                  </div>
                </div>
              )}

              {form.type === "ivfflat" && (
                <div className="mb-6 rounded-md border border-gray-200 bg-white p-4">
                  <h5 className="text-sm font-bold mb-4">IVFFlat Options</h5>
                  <div className="max-w-xs">
                    <label className="block mb-1 font-bold">Lists</label>
                    <Input
                      type="number"
                      min={1}
                      value={integerFieldValues.lists}
                      onValueChange={(value) => updateIntegerField("lists", value)}
                      placeholder="100"
                      className="focus-0"
                    />
                  </div>
                </div>
              )}

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
                          {showsSortControls && (
                            <div className="flex gap-1 shrink-0">
                              <Select
                                value={col.sortOrder}
                                onValueChange={(value) => updateColumn(idx, { sortOrder: value })}
                                clearable
                                items={["ASC", "DESC"] as const}
                                placeholder="Sort"
                                className="tiny w-[100px]"
                              />
                              <Select
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

                          {showsTextOpclassControls && (
                            <div className="flex gap-2 shrink-0">
                              <Select
                                value={
                                  knownTextOpclassOptions.some(
                                    (option) => option.value === col.opclass,
                                  )
                                    ? col.opclass
                                    : undefined
                                }
                                onValueChange={(value) =>
                                  updateColumn(idx, { opclass: normalizeOpclassValue(value) })
                                }
                                clearable
                                items={knownTextOpclassOptions}
                                placeholder="Known opclass"
                                className="tiny w-[180px]"
                              />
                              <Input
                                value={
                                  knownTextOpclassOptions.some(
                                    (option) => option.value === col.opclass,
                                  )
                                    ? ""
                                    : (col.opclass ?? "")
                                }
                                onValueChange={(value) =>
                                  updateColumn(idx, { opclass: normalizeOpclassValue(value) })
                                }
                                placeholder="Custom opclass"
                                className="h-8 w-[180px]"
                              />
                            </div>
                          )}

                          {isVectorIndex && (
                            <div className="flex gap-2 shrink-0">
                              <Select
                                value={col.opclass}
                                onValueChange={(value) =>
                                  updateColumn(idx, { opclass: normalizeOpclassValue(value) })
                                }
                                clearable
                                items={vectorOpclassOptions}
                                placeholder="Distance metric"
                                className="tiny w-[180px]"
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
