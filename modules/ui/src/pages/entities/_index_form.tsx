import { useTypeForm } from "@sonamu-kit/react-sui";
import { type SyntheticEvent, useEffect } from "react";
import {
  Button,
  Checkbox,
  Dropdown,
  type DropdownProps,
  Form,
  Header,
  Label,
  Segment,
} from "semantic-ui-react";
import type { EntityIndex } from "sonamu";
import z from "zod";
import { useCommonModal } from "../../components/core/CommonModal";
import { TableColumnAsyncSelect } from "../../components/TableColumnAsyncSelect";

type EntityIndexFormProps = { entityId: string; table: string; oldOne?: EntityIndex };

export function EntityIndexForm({ entityId, table, oldOne }: EntityIndexFormProps) {
  // CommonModal
  const { doneModal } = useCommonModal();

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
      using: z.enum(["btree", "hash", "gin", "gist"]).optional(),
      nullsNotDistinct: z.boolean().optional(),
    }),
    {
      type: "index",
      name: "",
      columns: [],
      ...oldOne,
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: onKeyDown 함수는 컴포넌트가 마운트될 때만 등록되어야 함
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: form 변경 시에만 실행
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
      doneModal(form);
    }
  };

  const handleColumnChange = (_: SyntheticEvent<HTMLElement, Event>, { value }: DropdownProps) => {
    console.log("handleColumnChange", value);
    const valueArray = (Array.isArray(value) ? value : [value]) as string[];
    const newColumns = valueArray.map((name) => {
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

  const typeOptions = ["index", "unique", "hnsw", "ivfflat"].map((k) => ({
    key: k,
    value: k,
    text: k.toUpperCase(),
  }));

  const usingOptions = [
    { key: "btree", text: "B-Tree" },
    { key: "hash", text: "Hash" },
    { key: "gin", text: "GIN" },
    { key: "gist", text: "GiST" },
  ].map((k) => ({ key: k.key, value: k.key, text: k.text }));

  return (
    <div className="entity-form-container">
      <div className="form-header">
        <Header
          size="medium"
          style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}
        >
          {oldOne ? "Edit Entity Index" : "New Entity Index"}
          <Header.Subheader style={{ marginTop: "4px" }}>
            <span style={{ fontWeight: 600, color: "#4183c4" }}>{table}</span> 테이블의 인덱스
            설정을 구성합니다.
          </Header.Subheader>
        </Header>
      </div>

      <div className="form-body">
        <Form>
          <Segment basic style={{ padding: 0 }}>
            {/* Index Name */}
            <Form.Field required>
              <label>
                Index Name
                <Label
                  basic
                  size="tiny"
                  style={{ fontWeight: "normal", color: "#888", marginLeft: "8px" }}
                >
                  자동 생성됨
                </Label>
              </label>
              <div className="ui fluid input">
                <input
                  {...register("name")}
                  className="focus-3"
                  disabled={!!oldOne?.name}
                  placeholder="인덱스 이름이 여기에 표시됩니다"
                />
              </div>
            </Form.Field>

            {/* Type & Option Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "24px",
                marginBottom: "24px",
              }}
            >
              <Form.Field required>
                <label>Type</label>
                <Dropdown
                  {...register("type")}
                  search
                  selection
                  fluid
                  options={typeOptions}
                  className="focus-0"
                />
              </Form.Field>

              {form.type === "unique" ? (
                <Form.Field>
                  <label>Nulls Not Distinct</label>
                  <Checkbox
                    toggle
                    checked={form.nullsNotDistinct ?? false}
                    onChange={(_, { checked }) =>
                      setForm({ ...form, nullsNotDistinct: checked ? true : undefined })
                    }
                    style={{ marginTop: "7px" }}
                  />
                </Form.Field>
              ) : (
                <Form.Field>
                  <label>Using</label>
                  <Dropdown
                    {...register("using")}
                    search
                    selection
                    fluid
                    options={usingOptions}
                    className="focus-0"
                    clearable
                  />
                </Form.Field>
              )}
            </div>

            {/* Target Columns Area */}
            <Form.Field className="columns-field">
              <Header size="small">Target Columns</Header>

              <div className="column-select-wrapper">
                <TableColumnAsyncSelect
                  value={
                    form.using !== "hash"
                      ? form.columns.map((col) => col.name) // 다중: 배열 전달
                      : form.columns[0]?.name || "" // 단일: 문자열 전달
                  }
                  onChange={handleColumnChange}
                  entityId={entityId}
                  className="focus-2"
                  placeholder="Select Columns..."
                  multiple={form.using !== "hash"}
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
                            <Dropdown
                              clearable
                              selection
                              compact
                              className="tiny"
                              placeholder="Sort"
                              value={col.sortOrder ?? ""}
                              options={[
                                { key: "asc", value: "ASC", text: "ASC" },
                                { key: "desc", value: "DESC", text: "DESC" },
                              ]}
                              onChange={(_, { value }) =>
                                updateColumn(idx, {
                                  sortOrder: value ? (value as "ASC" | "DESC") : undefined,
                                })
                              }
                            />
                            <Dropdown
                              clearable
                              selection
                              compact
                              className="tiny"
                              placeholder="Nulls"
                              value={col.nullsFirst ?? ""}
                              options={[
                                { key: "first", value: true, text: "NULLS FIRST" },
                                { key: "last", value: false, text: "NULLS LAST" },
                              ]}
                              onChange={(_, { value }) =>
                                updateColumn(idx, {
                                  nullsFirst: value === "" ? undefined : (value as boolean),
                                })
                              }
                            />
                          </div>
                        )}

                        {/* 순서 변경 버튼 */}
                        {form.columns.length > 1 && (
                          <Button.Group size="tiny" basic>
                            <Button
                              icon="angle up"
                              disabled={idx === 0}
                              onClick={() => moveColumn(idx, -1)}
                            />
                            <Button
                              icon="angle down"
                              disabled={idx === form.columns.length - 1}
                              onClick={() => moveColumn(idx, 1)}
                            />
                          </Button.Group>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Form.Field>
          </Segment>
        </Form>

        <Header size="small">Debug: Form State</Header>
        <Segment secondary className="debug-form-state">
          <pre>{JSON.stringify(form, null, 2)}</pre>
        </Segment>
      </div>

      <div className="form-footer">
        <Button onClick={() => doneModal(null)} className="cancel-btn">
          Cancel
        </Button>
        <Button primary onClick={handleSubmit} className="save-btn">
          Save Index
        </Button>
      </div>
    </div>
  );
}
