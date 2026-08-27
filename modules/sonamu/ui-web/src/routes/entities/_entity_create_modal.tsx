import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useTypeForm,
} from "@sonamu-kit/react-components";
import { camelize, pluralize, underscore } from "inflection";
import { useEffect } from "react";
import { z } from "zod";

import { EntityIdSelect } from "../../components/EntityIdSelect";
import { InputWithSuggestion } from "../../components/InputWithSuggestion";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { defaultCatch, isSonamuError } from "../../services/sonamu.shared";

type EntityCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (entityId: string) => void;
};

export function EntityCreateModal({ open, onOpenChange, onCompleted }: EntityCreateModalProps) {
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

  useEffect(() => {
    if (open) {
      setForm({
        id: "",
        title: "",
        table: "",
      });
    }
  }, [open, setForm]);

  const handleSubmit = () => {
    const ifError = (["id", "table", "title"] as const)
      .map((key) => {
        if (!form[key]) {
          addError(key, {
            content: `${camelize(key)} is required.`,
            pointing: "above",
          });
          return true;
        }
        return false;
      })
      .some((e) => e);
    if (ifError) {
      return;
    }

    SonamuUIService.createEntity(form)
      .then(() => {
        onOpenChange(false);
        if (onCompleted) {
          onCompleted(form.id);
        }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="entity-create-form max-w-4xl max-h-[90vh] flex flex-col bg-gray-50">
        <DialogHeader className="text-left">
          <DialogTitle>Entity Create Form</DialogTitle>
          <DialogDescription>Create a new entity with table definition</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-2">
          <form className="block">
            <div className="flex gap-[14px]">
              <div className="flex-1">
                <label className="block mb-1 font-bold">
                  ID <span className="text-red-500">*</span>
                </label>
                <Input {...register("id")} className="focus-0" />
              </div>
              <div className="flex-1">
                <label className="block mb-1 font-bold">ParentID</label>
                <EntityIdSelect {...register("parentId")} search clearable />
              </div>
            </div>
            <div className="flex gap-[14px] mt-4">
              <div className="flex-1">
                <label className="block mb-1 font-bold">
                  Table <span className="text-red-500">*</span>
                </label>
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
              <div className="flex-1">
                <label className="block mb-1 font-bold">
                  Title <span className="text-red-500">*</span>
                </label>
                <InputWithSuggestion {...register("title")} origin={underscore(form.id)} />
              </div>
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button type="submit" onClick={handleSubmit}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
