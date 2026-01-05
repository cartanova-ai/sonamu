import { Button, Input, useTypeForm } from "@sonamu-kit/react-components";
import { camelize, pluralize, underscore } from "inflection";
import { z } from "zod";
import PlusIcon from "~icons/lucide/plus";
import { useCommonModal } from "../../components/core/CommonModal";
import { EntityIdSelect } from "../../components/EntityIdSelect";
import { InputWithSuggestion } from "../../components/InputWithSuggestion";
import { defaultCatch, isSonamuError } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";

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
    },
  );

  const handleSubmit = () => {
    SonamuUIService.createEntity(form)
      .then(() => {
        doneModal(form.id);
      })
      .catch((e) => {
        if (isSonamuError(e) && e.code === 541) {
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
      <div className="ui padded segment">
        <div className="header-row">
          <h2 className="ui header">Entity Create Form</h2>
        </div>
        <div className="ui basic segment">
          <br />
          <form className="ui form">
            <div className="equal width fields">
              <div className="required field">
                <label>ID</label>
                <Input {...register("id")} className="focus-0" />
              </div>
              <div className="field">
                <label>ParentID</label>
                <EntityIdSelect {...register("parentId")} search clearable />
              </div>
            </div>
            <div className="equal width fields">
              <div className="required field">
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
              </div>
              <div className="required field">
                <label>Title</label>
                <InputWithSuggestion {...register("title")} origin={underscore(form.id)} />
              </div>
            </div>
            <div className="text-center">
              <Button
                variant="blue"
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
                      return false;
                    })
                    .some((e) => e === true);
                  if (ifError) {
                    return;
                  }

                  handleSubmit();
                }}
                icon={<PlusIcon />}
              >
                Create
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
