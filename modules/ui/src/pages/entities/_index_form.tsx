import { useCommonModal } from "../../components/core/CommonModal";
import { Button, Dropdown, Form, Header, Segment } from "semantic-ui-react";
import { useTypeForm } from "@sonamu-kit/react-sui";
import { z } from "zod";
import { EntityIndex } from "sonamu";
import { useEffect, useRef } from "react";
import { TableColumnAsyncSelect } from "../../components/TableColumnAsyncSelect";

type EntityIndexFormProps = { entityId: string; oldOne?: EntityIndex };
export function EntityIndexForm({ entityId, oldOne }: EntityIndexFormProps) {
  // CommonModal
  const { doneModal } = useCommonModal();

  // TypeForm
  const { form, setForm, register } = useTypeForm(
    z.object({
      type: z.enum(["index", "unique", "fulltext"]),
      columns: z.string().array(),
    }),
    {
      type: "index",
      columns: [],
      ...oldOne,
    }
  );

  // 초기 마운트 체크
  const isInitialMount = useRef(true);

  // form.type이 변경되면 columns 초기화 (초기 진입 시 제외)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setForm({ ...form, columns: [] });
  }, [form.type]);

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

  const handleSubmit = () => {
    doneModal(form);
  };

  const typeOptions = ["index", "unique", "fulltext"].map((k) => ({
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
                <Form.Field>
                  <label>Columns</label>
                  <TableColumnAsyncSelect
                    {...register("columns")}
                    entityId={entityId}
                    allowedTypes={
                      form.type === "fulltext" ? ["string", "text"] : undefined
                    }
                    className="focus-2"
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
