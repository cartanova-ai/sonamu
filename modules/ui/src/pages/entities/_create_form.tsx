import { Segment, Header, Form, Button } from "semantic-ui-react";
import { z } from "zod";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { useCommonModal } from "../../components/core/CommonModal";
import { defaultCatch, isSonamuError } from "../../services/sonamu.shared";
import { useTypeForm } from "@sonamu-kit/react-sui";
import { pluralize, underscore } from "inflection";
import { FormInputWithSuggestion } from "../../components/FormInputWithSuggestion";
import { camelize } from "inflection";

type EntityCreateFormProps = {};
export function EntityCreateForm({}: EntityCreateFormProps) {
  // useCommonModal
  const { doneModal } = useCommonModal();

  const { form, setForm, register, addError } = useTypeForm(
    z.object({
      id: z.string(),
      parentId: z.string().optional(),
      title: z.string(),
      table: z.string(),
    }),
    {
      id: "",
      title: "",
      table: "",
    }
  );

  const handleSubmit = () => {
    SonamuUIService.createEntity(form)
      .then(() => {
        doneModal(form.id);
      })
      .catch((e) => {
        if (isSonamuError(e) && e.code === 641) {
          addError("table", "이미 존재하는 테이블명입니다.");
        } else if (e.code === 400) {
          addError("id", e.message);
        } else {
          defaultCatch(e);
        }
      });
  };

  return (
    <div className="form entity-create-form">
      <Segment padded basic>
        <Segment padded color="green">
          <div className="header-row">
            <Header>Entity Create Form</Header>
          </div>
          <Segment basic>
            <br />
            <Form>
              <Form.Group widths="equal">
                <Form.Field required>
                  <label>ID</label>
                  <Form.Input {...register("id")} className="focus-0" />
                </Form.Field>
                <Form.Field>
                  <label>ParentID</label>
                  <Form.Input {...register("parentId")} />
                </Form.Field>
              </Form.Group>
              <Form.Group widths="equal">
                <Form.Field required>
                  <label>Table</label>
                  <Form.Input
                    {...register("table")}
                    onFocus={() => {
                      if (form.table === "" && form.id !== "") {
                        setForm({
                          ...form,
                          table: pluralize(underscore(form.id)),
                        });
                      }
                    }}
                  />
                </Form.Field>
                <Form.Field required>
                  <label>Title</label>
                  <FormInputWithSuggestion
                    {...register("title")}
                    origin={underscore(form.id)}
                  />
                </Form.Field>
              </Form.Group>
              <div className="text-center">
                <Button
                  color="blue"
                  onClick={() => {
                    const ifError = ["id", "table", "title"]
                      .map((key) => {
                        if (!form[key as keyof typeof form]) {
                          addError(key, {
                            content: `${camelize(key)} is required.`,
                            pointing: "above",
                          });
                          return true;
                        }
                      })
                      .some((e) => e === true);
                    if (ifError) {
                      return;
                    }

                    handleSubmit();
                  }}
                  icon="plus"
                  content="Create"
                />
              </div>
            </Form>
          </Segment>
        </Segment>
      </Segment>
    </div>
  );
}
