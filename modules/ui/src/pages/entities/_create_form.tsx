import { Segment, Header, Form, Input, Button } from "semantic-ui-react";
import { z } from "zod";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { useCommonModal } from "../../components/core/CommonModal";
import { defaultCatch } from "../../services/sonamu.shared";
import { useTypeForm } from "@sonamu-kit/react-sui";
import { pluralize, underscore } from "inflection";

type EntityCreateFormProps = {};
export function EntityCreateForm({}: EntityCreateFormProps) {
  // useCommonModal
  const { doneModal } = useCommonModal();

  const { form, setForm, register } = useTypeForm(
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
      .catch(defaultCatch);
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
                <Form.Field>
                  <label>ID</label>
                  <Input {...register("id")} className="focus-0" />
                </Form.Field>
                <Form.Field>
                  <label>ParentID</label>
                  <Input {...register("parent_id")} />
                </Form.Field>
              </Form.Group>
              <Form.Group widths="equal">
                <Form.Field>
                  <label>Table</label>
                  <Input
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
                <Form.Field>
                  <label>Title</label>
                  <Input {...register("title")} />
                </Form.Field>
              </Form.Group>
              <div className="text-center">
                <Button
                  color="blue"
                  onClick={() => handleSubmit()}
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
