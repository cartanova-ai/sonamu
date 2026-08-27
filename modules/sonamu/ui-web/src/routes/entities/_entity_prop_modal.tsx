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
import { useEffect, useMemo } from "react";
import { type EntityProp } from "sonamu";
import { z } from "zod";
import CodeIcon from "~icons/lucide/code";

import { EntityIdSelect } from "../../components/EntityIdSelect";
import { FormNumberInput } from "../../components/FormNumberInput";
import { FormTypeIdAsyncSelect } from "../../components/FormTypeIdAsyncSelect";
import { InputWithSuggestion } from "../../components/InputWithSuggestion";
import { EntityPropZodSchema } from "../../services/entity-prop-zod-schema";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { defaultCatch } from "../../services/sonamu.shared";

type EntityPropModalProps = {
  entityId: string;
  oldOne?: EntityProp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (data: EntityProp) => void;
};
export function EntityPropModal({
  entityId,
  oldOne,
  open,
  onOpenChange,
  onCompleted,
}: EntityPropModalProps) {
  const generatedTypeSchema = z.enum(["STORED", "VIRTUAL"]);
  const numberTypeSchema = z.enum(["real", "double precision", "numeric"]);
  const virtualTypeSchema = z.enum(["code", "query"]);
  const relationTypeSchema = z.enum(["OneToOne", "BelongsToOne", "HasMany", "ManyToMany"]);
  // 초기값
  const initialForm = useMemo(
    () => ({
      name: "",
      type: "",
      desc: "",
      ...oldOne,
    }),
    [oldOne],
  );

  // TypeForm
  const { form, setForm, register, addError } = useTypeForm(
    z.object({
      name: z.string(),
      type: z.string(),
      desc: z.string().optional(),
      nullable: z.boolean().optional(),
      toFilter: z.boolean().optional(),
      dbDefault: z.string().optional(),
      length: z.number().optional(),
      numberType: z.enum(["real", "double precision", "numeric"]).optional(),
      precision: z.number().optional(),
      scale: z.number().optional(),
      id: z.string().optional(),
      virtualType: z.enum(["code", "query"]).optional(),
      dimensions: z.number().optional(),
      as: z.union([z.object({ ref: z.string() }), z.any()]).optional(),
      relationType: z.enum(["OneToOne", "BelongsToOne", "HasMany", "ManyToMany"]).optional(),
      customJoinClause: z.string().optional(),
      hasJoinColumn: z.boolean().optional(),
      joinColumn: z.string().optional(),
      fromColumn: z.string().optional(),
      joinTable: z.string().optional(),
      onUpdate: EntityPropZodSchema.RelationOn.optional(),
      onDelete: EntityPropZodSchema.RelationOn.optional(),
      with: z.string().optional(),
      generated: EntityPropZodSchema.GeneratedColumn.optional(),
      zodFormat: EntityPropZodSchema.ZodStringFormat.optional(),
    }),
    initialForm,
  );

  const typeOptions = [
    "string",
    "string[]",
    "enum",
    "enum[]",
    "integer",
    "integer[]",
    "bigInteger",
    "bigInteger[]",
    "number",
    "number[]",
    "numeric",
    "numeric[]",
    "boolean",
    "boolean[]",
    "date",
    "date[]",
    "uuid",
    "uuid[]",
    "json",
    "vector",
    "vector[]",
    "virtual",
    "relation",
    "tsvector",
  ];

  // 폼 초기화
  useEffect(() => {
    if (open) {
      setForm(initialForm);
    }
  }, [open, initialForm, setForm]);

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

  useEffect(() => {
    const result = EntityPropZodSchema.safeParse(form);
    if (result.success) {
      setForm(result.data);
    }
  }, [form.type, form.relationType]);

  function handleSubmit() {
    const result = EntityPropZodSchema.safeParse(form);
    if (!result.success) {
      console.error(result.error);
      result.error.issues.forEach((issue) => {
        if (issue.path.length) {
          addError(issue.path[0].toString(), {
            content: issue.message,
            pointing: "above",
          });
        }
      });
      return;
    }

    // 성공시 콜백 호출하고 모달 닫기
    if (onCompleted) {
      onCompleted(result.data);
    }
    onOpenChange(false);
  }

  const openVscodePreset = (preset: "types") => {
    SonamuUIService.openVscode({
      entityId,
      preset,
    }).catch(defaultCatch);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="entity-prop-form max-w-4xl max-h-[90vh] flex flex-col bg-gray-50">
        <DialogHeader className="text-left">
          <DialogTitle>EntityProp Form</DialogTitle>
          <DialogDescription className="sr-only">Add or modify entity property</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-scroll flex-1 pt-4 pl-2">
          <form className="block">
            <div className="flex gap-[14px] mb-[14px]">
              <div className="flex-1">
                <label className="block mb-1 font-bold">
                  Type <span className="text-red-500">*</span>
                </label>
                <Select
                  value={form.type}
                  onValueChange={(value) => value && setForm({ ...form, type: value })}
                  items={typeOptions}
                  className="focus-2"
                  searchable
                />
              </div>
              <div className="flex-1">
                <label className="block mb-1 font-bold">
                  Name <span className="text-red-500">*</span>
                </label>
                <Input {...register("name")} className="focus-0" />
              </div>
              <div className="flex-1">
                <label className="block mb-1 font-bold">Description</label>
                <InputWithSuggestion
                  {...register("desc")}
                  className="focus-1"
                  origin={form.name}
                  entityId={entityId}
                />
              </div>
            </div>
            <div className="flex gap-[14px] mb-[14px]">
              <div className="flex-1">
                <label className="block mb-1 font-bold">Nullable</label>
                <Switch
                  checked={form.nullable ?? false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, nullable: checked ? true : undefined })
                  }
                />
              </div>
              <div className="flex-1">
                <label className="block mb-1 font-bold">To Filter</label>
                <Switch
                  checked={form.toFilter ?? false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, toFilter: checked ? true : undefined })
                  }
                />
              </div>
              <div className="flex-1">
                <label className="block mb-1 font-bold">Generated</label>
                <Switch
                  checked={form.generated !== undefined}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setForm({
                        ...form,
                        generated: { type: "STORED", expression: "" },
                        dbDefault: undefined,
                      });
                    } else {
                      setForm({ ...form, generated: undefined });
                    }
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="block mb-1 font-bold">DB Default</label>
                <div className="flex items-center gap-0">
                  <span className="h-[31px] px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-sm text-gray-700">
                    {(() => {
                      if (form.dbDefault === undefined || form.dbDefault === "") {
                        return "undefined";
                      } else if (!Number.isNaN(Number(form.dbDefault))) {
                        return "number";
                      } else if (form.dbDefault.startsWith('"') && form.dbDefault.endsWith('"')) {
                        return "string";
                      } else {
                        return "raw";
                      }
                    })()}
                  </span>
                  <Input
                    {...register("dbDefault")}
                    className="focus-5 rounded-l-none rounded-r-none flex-1"
                    disabled={form.generated !== undefined}
                  />
                  {form.dbDefault !== undefined && form.dbDefault !== "" && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 w-10 p-0 rounded-l-none border border-l-0"
                      onClick={() => setForm({ ...form, dbDefault: undefined })}
                      disabled={form.generated !== undefined}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {form.generated && (
              <div className="flex gap-[14px] mb-[14px]">
                <div className="flex-[2_1_0%]">
                  <label className="block mb-1 font-bold">
                    Storage Type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={form.generated?.type ?? "STORED"}
                    onValueChange={(value) => {
                      const parsed = generatedTypeSchema.safeParse(value);
                      if (!parsed.success) return;
                      const newGenerated = {
                        type: parsed.data,
                        expression: form.generated?.expression ?? "",
                      };
                      setForm({ ...form, generated: newGenerated });
                    }}
                    items={["STORED", "VIRTUAL"] satisfies string[]}
                    searchable
                  />
                </div>
                <div className="flex-1">
                  <label className="block mb-1 font-bold">
                    Generation Expression <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={form.generated?.expression ?? ""}
                    onValueChange={(value) => {
                      const newGenerated = {
                        type: form.generated?.type ?? "STORED",
                        expression: value,
                      };
                      setForm({ ...form, generated: newGenerated });
                    }}
                    placeholder="예: price * 1.1"
                  />
                </div>
              </div>
            )}
            <div className="my-[14px] border-t border-[rgba(34,36,38,0.15)] h-0" />
            {(form.type === "string" ||
              form.type === "string[]" ||
              form.type === "enum" ||
              form.type === "enum[]") && (
              <div className="flex gap-[14px] mb-[14px]">
                {(form.type === "string" || form.type === "string[]") && (
                  <>
                    <div className="flex-1">
                      <label className="block mb-1 font-bold">Length</label>
                      <FormNumberInput
                        value={form.length}
                        onChange={(_, { value }) =>
                          setForm({ ...form, length: value === "" ? undefined : value })
                        }
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block mb-1 font-bold">Zod Format</label>
                      <Select
                        value={form.zodFormat}
                        onValueChange={(value) =>
                          setForm({ ...form, zodFormat: value || undefined })
                        }
                        clearable
                        items={[...EntityPropZodSchema.ZodStringFormat.options]}
                        placeholder="Select format..."
                        searchable
                      />
                    </div>
                  </>
                )}
                {form.type === "enum" ? (
                  <div className="flex-1">
                    <label className="block mb-1 font-bold">
                      Enum ID <span className="text-red-500">*</span>
                    </label>
                    <div className="flex">
                      <FormTypeIdAsyncSelect
                        {...register("id")}
                        search
                        filter="enums"
                        withAddEnumButton={{ entityId, propName: form.name }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1">&nbsp;</div>
                )}
              </div>
            )}
            {(form.type === "integer" ||
              form.type === "integer[]" ||
              form.type === "bigInteger" ||
              form.type === "bigInteger[]" ||
              form.type === "number" ||
              form.type === "number[]" ||
              form.type === "numeric" ||
              form.type === "numeric[]") && (
              <div className="flex gap-[14px] mb-[14px]">
                {form.type === "number" && (
                  <div className="flex-1">
                    <label className="block mb-1 font-bold">Number Type</label>
                    <Select
                      value={form.numberType}
                      onValueChange={(value) => {
                        const parsed = numberTypeSchema.optional().safeParse(value);
                        if (parsed.success) setForm({ ...form, numberType: parsed.data });
                      }}
                      clearable
                      items={["real", "double precision", "numeric"] satisfies string[]}
                      placeholder="Select..."
                      searchable
                    />
                  </div>
                )}
                {(form.type === "numeric" ||
                  (form.type === "number" && form.numberType === "numeric")) && (
                  <>
                    <div className="flex-1">
                      <label className="block mb-1 font-bold">
                        Precision <span className="text-red-500">*</span>
                      </label>
                      <FormNumberInput
                        value={form.precision}
                        onChange={(_, { value }) =>
                          setForm({ ...form, precision: value === "" ? undefined : value })
                        }
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block mb-1 font-bold">
                        Scale <span className="text-red-500">*</span>
                      </label>
                      <FormNumberInput
                        value={form.scale}
                        onChange={(_, { value }) =>
                          setForm({ ...form, scale: value === "" ? undefined : value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            {(form.type === "json" || form.type === "virtual") && (
              <div className="flex gap-[14px] mb-[14px]">
                <div className="flex-1">
                  <label className="block mb-1 font-bold">
                    CustomType ID <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-1">
                    <FormTypeIdAsyncSelect {...register("id")} search />
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => openVscodePreset("types")}
                      icon={<CodeIcon />}
                    />
                  </div>
                </div>
              </div>
            )}
            {form.type === "virtual" && (
              <div className="flex gap-[14px] mb-[14px]">
                <div className="flex-1 max-w-[50%]">
                  <label className="block mb-1 font-bold">Virtual Type</label>
                  <Select
                    value={form.virtualType}
                    onValueChange={(value) => {
                      const parsed = virtualTypeSchema.optional().safeParse(value);
                      if (parsed.success) setForm({ ...form, virtualType: parsed.data });
                    }}
                    clearable
                    items={["code", "query"] satisfies string[]}
                    placeholder="code (default)"
                    searchable
                  />
                </div>
              </div>
            )}
            {(form.type === "vector" || form.type === "vector[]") && (
              <div className="flex gap-[14px] mb-[14px]">
                <div className="flex-1">
                  <label className="block mb-1 font-bold">
                    Dimensions <span className="text-red-500">*</span>
                  </label>
                  <FormNumberInput
                    value={form.dimensions}
                    onChange={(_, { value }) =>
                      setForm({ ...form, dimensions: value === "" ? undefined : value })
                    }
                    placeholder="예: 1024 (Voyage-3)"
                  />
                </div>
              </div>
            )}
            {form.type === "relation" && (
              <>
                <div className="flex gap-[14px] mb-[14px]">
                  <div className="flex-1">
                    <label className="block mb-1 font-bold">
                      Relation Type <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={form.relationType ?? ""}
                      onValueChange={(value) => {
                        const parsed = relationTypeSchema.optional().safeParse(value);
                        if (parsed.success) setForm({ ...form, relationType: parsed.data });
                      }}
                      items={
                        ["OneToOne", "BelongsToOne", "HasMany", "ManyToMany"] satisfies string[]
                      }
                      searchable
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block mb-1 font-bold">
                      With <span className="text-red-500">*</span>
                    </label>
                    <EntityIdSelect {...register("with")} search clearable />
                  </div>
                </div>
                <div className="flex gap-[14px] mb-[14px]">
                  {form.relationType === "OneToOne" && (
                    <div className="flex-1">
                      <label className="block mb-1 font-bold">HasJoinColumn</label>
                      <Switch
                        checked={form.hasJoinColumn ?? false}
                        onCheckedChange={(checked) =>
                          setForm({ ...form, hasJoinColumn: checked ? true : undefined })
                        }
                      />
                    </div>
                  )}
                  {(form.hasJoinColumn ||
                    form.relationType === "BelongsToOne" ||
                    form.relationType === "ManyToMany") && (
                    <>
                      <div className="flex-1">
                        <label className="block mb-1 font-bold">
                          ON UPDATE <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={form.onUpdate}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              onUpdate: value,
                            })
                          }
                          items={[...EntityPropZodSchema.RelationOn.options]}
                          searchable
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block mb-1 font-bold">
                          ON DELETE <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={form.onDelete}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              onDelete: value,
                            })
                          }
                          items={[...EntityPropZodSchema.RelationOn.options]}
                          searchable
                        />
                      </div>
                    </>
                  )}
                  {form.relationType === "HasMany" && (
                    <>
                      <div className="flex-1">
                        <label className="block mb-1 font-bold">
                          JoinColumn <span className="text-red-500">*</span>
                        </label>
                        <Input {...register("joinColumn")} />
                      </div>
                      <div className="flex-1">
                        <label className="block mb-1 font-bold">FromColumn</label>
                        <Input {...register("fromColumn")} />
                      </div>
                    </>
                  )}
                  {form.relationType === "ManyToMany" && (
                    <div className="flex-1">
                      <label className="block mb-1 font-bold">
                        JoinTable <span className="text-red-500">*</span>
                      </label>
                      <Input {...register("joinTable")} />
                    </div>
                  )}
                </div>
                {form.relationType === "BelongsToOne" && (
                  <div className="flex gap-[14px] mb-[14px]">
                    <div className="flex-1">
                      <label className="block mb-1 font-bold">Custom JoinClause</label>
                      <Input {...register("customJoinClause")} />
                    </div>
                  </div>
                )}
              </>
            )}
          </form>

          <h5 className="text-[1.07142857rem] font-bold my-[calc(2rem-0.14285714em)] mb-4">
            Debug: Form State
          </h5>
          <div className="bg-[#f3f4f5] p-4 rounded-[0.28571429rem] debug-form-state">
            <pre>{JSON.stringify(form, null, 2)}</pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="default" type="submit" onClick={handleSubmit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
