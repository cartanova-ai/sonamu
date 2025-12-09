import { useTypeForm } from "@sonamu-kit/react-sui";
import { camelize } from "inflection";
import { useEffect, useRef } from "react";
import { Button, Dropdown, Form, Header, Icon, Label, Segment } from "semantic-ui-react";
import type { EntityIndex } from "sonamu";
import { z } from "zod";
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
      name: z.string(),
      columns: z.string().array(),
      parser: z.enum(["built-in", "ngram"]).optional(),
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
      const indexName = `${table}_${form.columns.join("_")}_${form.type}`;
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
    <div className="form entity-index-form">
      <Segment padded basic>
        <Segment padded color="green">
          <div className="header-row">
            <Header>EntityIndex Form</Header>
          </div>
          <Segment basic>
            <code>{JSON.stringify(form)}</code>
            <br />
            <Form>
              <Form.Group widths="equal">
                <Form.Field width="6">
                  <label>Type</label>
                  <Dropdown
                    {...register("type")}
                    search
                    selection
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
                      options={parserOptions}
                      className="focus-2"
                    />
                  </Form.Field>
                )}
                <Form.Field>
                  <label>Columns</label>
                  <TableColumnAsyncSelect
                    {...register("columns")}
                    entityId={entityId}
                    allowedTypes={form.type === "fulltext" ? ["string", "text"] : undefined}
                    className="focus-2"
                  />
                  {form.columns.length > 1 && (
                    <div className="column-order">
                      <Label size="small" basic>
                        순서
                      </Label>
                      <div style={{ marginTop: "4px" }}>
                        {form.columns.map((col, idx) => (
                          <div className="column-order-item" key={col}>
                            <span className="column-order-item-index">{idx + 1}.</span>
                            <span className="column-order-item-column">{col}</span>
                            <Icon
                              name="arrow up"
                              className={idx === 0 ? "disabled" : ""}
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
                            <Icon
                              name="arrow down"
                              className={idx === form.columns.length - 1 ? "disabled" : ""}
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Form.Field>
                <Form.Field required>
                  <label>Name</label>
                  <Form.Input
                    {...register("name")}
                    className="focus-3"
                    origin={form.name}
                    entityId={entityId}
                    disabled={!!oldOne?.name}
                  />
                </Form.Field>
              </Form.Group>
            </Form>
            <Button type="submit" primary onClick={handleSubmit}>
              Save
            </Button>
          </Segment>
        </Segment>
      </Segment>
    </div>
  );
}
