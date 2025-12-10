import { useTypeForm } from "@sonamu-kit/react-sui";
import { camelize } from "inflection";
import { useEffect, useRef } from "react";
import { Button, Checkbox, Dropdown, Form, Header, Label, Segment } from "semantic-ui-react";
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
      type: z.enum(["index", "unique", "fulltext"]),
      columns: z.array(
        z.object({
          name: z.string(),
          nullsFirst: z.boolean().optional(),
          sortOrder: z.enum(["ASC", "DESC"]).optional(),
        }),
      ),
      name: z.string().min(1).max(63),
      parser: z.enum(["built-in", "ngram"]).optional(),
      nullsNotDistinct: z.boolean().optional(),
    }),
    {
      type: "index",
      name: "",
      columns: [],
      ...oldOne,
    },
  );

  // 초기 마운트 체크
  const isInitialMount = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.type이 변경되면 columns 초기화 (초기 진입 시 제외)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setForm({ ...form, columns: [], parser: undefined });
  }, [form.type]);

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

    return () => {
      document.removeEventListener("keydown", onKeydown);
    };
  }, [form]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.type, form.columns, table, oldOne 변경시에만 실행
  useEffect(() => {
    if (!oldOne) {
      const indexName = `${table}_${form.columns.map((col) => col.name).join("_")}_${form.type}`;
      setForm({ ...form, name: indexName });
    }
  }, [form.type, form.columns, table, oldOne]);

  const handleSubmit = () => {
    const ifError = ["name"]
      .map((key) => {
        if (!form[key as keyof typeof form]) {
          addError(key, {
            content: `${camelize(key)} is required.`,
            pointing: "above",
          });
          return true;
        }
        // 인덱스명은 최대 63byte
        if (form.name.length > 63) {
          addError("name", {
            content: "인덱스명은 최대 63byte입니다.",
            pointing: "above",
          });
          return true;
        }
        return false;
      })
      .some((e) => e === true);
    if (ifError) {
      return;
    }

    doneModal(form);
  };

  const typeOptions = ["index", "unique", "fulltext"].map((k) => ({
    key: k,
    value: k,
    text: k.toUpperCase(),
  }));

  const parserOptions = ["built-in", "ngram"].map((k) => ({
    key: k,
    value: k,
    text: k.toUpperCase(),
  }));

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
              {form.type === "fulltext" && (
                <Form.Field>
                  <label>Parser</label>
                  <Dropdown
                    {...register("parser")}
                    search
                    selection
                    fluid
                    options={parserOptions}
                    className="focus-2"
                  />
                </Form.Field>
              )}
              {form.type === "unique" && (
                <Form.Field>
                  <label>Nulls Not Distinct</label>
                  <Checkbox
                    toggle
                    value={form.nullsNotDistinct ? "1" : "0"}
                    onChange={(_, { checked }) => {
                      if (checked) {
                        setForm({ ...form, nullsNotDistinct: true });
                      } else {
                        setForm({ ...form, nullsNotDistinct: undefined });
                      }
                    }}
                    style={{ marginTop: "7px" }}
                  />
                </Form.Field>
              )}
            </div>

            <Form.Field className="columns-field">
              <Header size="small">Target Columns</Header>

              <div className="column-select-wrapper">
                <TableColumnAsyncSelect
                  value={form.columns.map((col) => col.name)}
                  onChange={(_, { value }) => {
                    const names = value as string[];
                    const newColumns = names.map((name) => {
                      const existing = form.columns.find((c) => c.name === name);
                      return existing ?? { name };
                    });
                    setForm({ ...form, columns: newColumns });
                  }}
                  entityId={entityId}
                  allowedTypes={form.type === "fulltext" ? ["string", "text"] : undefined}
                  className="focus-2"
                  placeholder="Columns"
                />
              </div>

              {/* 컬럼 리스트 영역 */}
              {form.columns.length > 0 && (
                <div className="column-config-area">
                  {form.columns.map((col, idx) => (
                    <div className="column-card" key={col.name}>
                      <div className="column-info">
                        <span className="column-badge">{idx + 1}</span>
                        <span className="column-name">{col.name}</span>
                      </div>

                      <div className="column-controls">
                        {form.type !== "fulltext" && (
                          <div className="sort-controls">
                            <Dropdown
                              clearable
                              selection
                              className="tiny"
                              placeholder="Sort"
                              value={col.sortOrder}
                              options={[
                                {
                                  key: "asc",
                                  value: "ASC",
                                  text: "ASC",
                                },
                                {
                                  key: "desc",
                                  value: "DESC",
                                  text: "DESC",
                                },
                              ]}
                              onChange={(_, { value }) => {
                                const newColumns = [...form.columns];
                                if (value === "") {
                                  delete newColumns[idx].sortOrder;
                                } else {
                                  newColumns[idx] = {
                                    ...newColumns[idx],
                                    sortOrder: value as "ASC" | "DESC",
                                  };
                                }
                                setForm({ ...form, columns: newColumns });
                              }}
                            />
                            <Dropdown
                              clearable
                              selection
                              className="tiny"
                              placeholder="Nulls"
                              value={col.nullsFirst}
                              options={[
                                { key: "first", value: true, text: "NULLS FIRST" },
                                { key: "last", value: false, text: "NULLS LAST" },
                              ]}
                              onChange={(_, { value }) => {
                                const newColumns = [...form.columns];
                                if (value === "") {
                                  delete newColumns[idx].nullsFirst;
                                } else {
                                  newColumns[idx] = {
                                    ...newColumns[idx],
                                    nullsFirst: value as boolean,
                                  };
                                }
                                setForm({ ...form, columns: newColumns });
                              }}
                            />
                          </div>
                        )}

                        {form.columns.length > 1 && (
                          <Button.Group size="tiny" basic>
                            <Button
                              icon="angle up"
                              disabled={idx === 0}
                              onClick={() => {
                                if (idx === 0) return;
                                const newColumns = [...form.columns];
                                [newColumns[idx - 1], newColumns[idx]] = [
                                  newColumns[idx],
                                  newColumns[idx - 1],
                                ];
                                setForm({ ...form, columns: newColumns });
                              }}
                            />
                            <Button
                              icon="angle down"
                              disabled={idx === form.columns.length - 1}
                              onClick={() => {
                                if (idx === form.columns.length - 1) return;
                                const newColumns = [...form.columns];
                                [newColumns[idx], newColumns[idx + 1]] = [
                                  newColumns[idx + 1],
                                  newColumns[idx],
                                ];
                                setForm({ ...form, columns: newColumns });
                              }}
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
