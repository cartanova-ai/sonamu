import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
      <DialogContent className="entity-index-form max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{oldOne ? "Edit Entity Index" : "New Entity Index"}</DialogTitle>
          <DialogDescription>
            <span style={{ fontWeight: 600, color: "#4183c4" }}>{table}</span> 테이블의 인덱스
            설정을 구성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4">
          <form className="ui form">
            <div className="ui basic segment" style={{ padding: 0 }}>
              {/* Index Name */}
              <div className="required field">
                <label>
                  Index Name
                  <span
                    className="ui basic tiny label"
                    style={{ fontWeight: "normal", color: "#888", marginLeft: "8px" }}
                  >
                    자동 생성됨
                  </span>
                </label>
                <div className="ui fluid input">
                  <input
                    {...register("name")}
                    className="focus-3"
                    disabled={!!oldOne?.name}
                    placeholder="인덱스 이름이 여기에 표시됩니다"
                  />
                </div>
              </div>

              {/* Type & Option Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "24px",
                  marginBottom: "24px",
                }}
              >
                <div className="required field">
                  <label>Type</label>
                  <Select
                    value={form.type}
                    onValueChange={(value) =>
                      value && setForm({ ...form, type: value as typeof form.type })
                    }
                  >
                    <SelectTrigger className="focus-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.type === "unique" ? (
                  <div className="field">
                    <label>Nulls Not Distinct</label>
                    <Switch
                      checked={form.nullsNotDistinct ?? false}
                      onCheckedChange={(value) =>
                        setForm({ ...form, nullsNotDistinct: value ? true : undefined })
                      }
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>Using</label>
                    <Select
                      value={form.using}
                      onValueChange={(value) => {
                        setForm({
                          ...form,
                          using: value as NonNullable<EntityIndex["using"]> | undefined,
                        });
                      }}
                      clearable
                    >
                      <SelectTrigger className="focus-0">
                        <SelectValue placeholder="Select using..." />
                      </SelectTrigger>
                      <SelectContent>
                        {usingOptions.map((opt) => (
                          <SelectItem key={opt.key} value={opt.key}>
                            {opt.text}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Target Columns Area */}
              <div className="field columns-field">
                <h5 className="ui small header">Target Columns</h5>

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
                  <div className="column-config-area">
                    {form.columns.map((col, idx) => (
                      <div className="column-card" key={col.name}>
                        <div className="column-info">
                          <span className="column-badge">{idx + 1}</span>
                          <span className="column-name">{col.name}</span>
                        </div>

                        <div className="column-controls">
                          {/* B-Tree 정렬 옵션 */}
                          {(form.using === "btree" || !form.using) && (
                            <div className="sort-controls">
                              <Select
                                value={col.sortOrder}
                                onValueChange={(value) =>
                                  updateColumn(idx, {
                                    sortOrder: value as "ASC" | "DESC" | undefined,
                                  })
                                }
                                clearable
                              >
                                <SelectTrigger className="tiny">
                                  <SelectValue placeholder="Sort" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ASC">ASC</SelectItem>
                                  <SelectItem value="DESC">DESC</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={
                                  col.nullsFirst === undefined ? undefined : String(col.nullsFirst)
                                }
                                onValueChange={(value) =>
                                  updateColumn(idx, {
                                    nullsFirst: value === undefined ? undefined : value === "true",
                                  })
                                }
                                clearable
                              >
                                <SelectTrigger className="tiny">
                                  <SelectValue placeholder="Nulls" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">NULLS FIRST</SelectItem>
                                  <SelectItem value="false">NULLS LAST</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* 순서 변경 버튼 */}
                          {form.columns.length > 1 && (
                            <div className="ui tiny basic buttons">
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={idx === 0}
                                onClick={() => moveColumn(idx, -1)}
                                icon={<ChevronUpIcon />}
                              />
                              <Button
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

          <h5 className="ui small header">Debug: Form State</h5>
          <div className="ui secondary segment debug-form-state">
            <pre>{JSON.stringify(form, null, 2)}</pre>
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
