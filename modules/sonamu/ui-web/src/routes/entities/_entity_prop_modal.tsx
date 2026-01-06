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
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useTypeForm,
} from "@sonamu-kit/react-components";
import { useEffect, useMemo } from "react";
import type { EntityProp } from "sonamu";
import { z } from "zod";
import CodeIcon from "~icons/lucide/code";
import { EntityIdSelect } from "../../components/EntityIdSelect";
import { FormNumberInput } from "../../components/FormNumberInput";
import { FormTypeIdAsyncSelect } from "../../components/FormTypeIdAsyncSelect";
import { InputWithSuggestion } from "../../components/InputWithSuggestion";
import { EntityPropZodSchema } from "../../services/entity-prop-zod-schema";
import { defaultCatch } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";

type RelationOn = z.infer<typeof EntityPropZodSchema.RelationOn>;

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
    }),
    initialForm,
  );
  console.log({ oldOne, form });

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

  const handleSubmit = () => {
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
  };

  const openVscodePreset = (preset: "types") => {
    SonamuUIService.openVscode({
      entityId,
      preset,
    }).catch(defaultCatch);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="entity-prop-form max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>EntityProp Form</DialogTitle>
          <DialogDescription className="sr-only">Add or modify entity property</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4">
          <form className="ui form">
            <div className="equal width fields">
              <div className="required field">
                <label>Type</label>
                <Select
                  value={form.type}
                  onValueChange={(value) => value && setForm({ ...form, type: value })}
                >
                  <SelectTrigger className="focus-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="required field">
                <label>Name</label>
                <Input {...register("name")} className="focus-0" />
              </div>
              <div className="field">
                <label>Description</label>
                <InputWithSuggestion
                  {...register("desc")}
                  className="focus-1"
                  origin={form.name}
                  entityId={entityId}
                />
              </div>
            </div>
            <div className="equal width fields">
              <div className="field">
                <label>Nullable</label>
                <Switch
                  checked={form.nullable ?? false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, nullable: checked ? true : undefined })
                  }
                />
              </div>
              <div className="field">
                <label>To Filter</label>
                <Switch
                  checked={form.toFilter ?? false}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, toFilter: checked ? true : undefined })
                  }
                />
              </div>
              <div className="field">
                <label>Generated</label>
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
              <div className="field">
                <label>DB Default</label>
                <div className="flex items-center gap-0">
                  <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-sm text-gray-700">
                    {(() => {
                      if (form.dbDefault === undefined || form.dbDefault === "") {
                        return "undefined";
                      } else if (Number.isNaN(Number(form.dbDefault)) === false) {
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
              <div className="equal width fields">
                <div className="required field" style={{ flex: 2 }}>
                  <label>Storage Type</label>
                  <Select
                    value={form.generated?.type ?? "STORED"}
                    onValueChange={(value) => {
                      const newGenerated = {
                        type: value as "STORED" | "VIRTUAL",
                        expression: form.generated?.expression ?? "",
                      };
                      setForm({ ...form, generated: newGenerated });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STORED">STORED</SelectItem>
                      <SelectItem value="VIRTUAL">VIRTUAL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="required field">
                  <label>Generation Expression</label>
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
            <div className="ui divider" />
            {(form.type === "string" ||
              form.type === "string[]" ||
              form.type === "enum" ||
              form.type === "enum[]") && (
              <div className="equal width fields">
                {form.type === "string" && (
                  <div className="field">
                    <label>Length</label>
                    <FormNumberInput
                      value={form.length}
                      onChange={(_, { value }) =>
                        setForm({ ...form, length: value === "" ? undefined : value })
                      }
                    />
                  </div>
                )}
                {form.type === "enum" ? (
                  <div className="required field">
                    <label>Enum ID</label>
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
                  <div className="field">&nbsp;</div>
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
              <div className="equal width fields">
                {form.type === "number" && (
                  <div className="field">
                    <label>Number Type</label>
                    <Select
                      value={form.numberType}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          numberType: value as "real" | "double precision" | "numeric" | undefined,
                        })
                      }
                      clearable
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="real">real</SelectItem>
                        <SelectItem value="double precision">double precision</SelectItem>
                        <SelectItem value="numeric">numeric</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(form.type === "numeric" ||
                  (form.type === "number" && form.numberType === "numeric")) && (
                  <>
                    <div className="required field">
                      <label>Precision</label>
                      <FormNumberInput
                        value={form.precision}
                        onChange={(_, { value }) =>
                          setForm({ ...form, precision: value === "" ? undefined : value })
                        }
                      />
                    </div>
                    <div className="required field">
                      <label>Scale</label>
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
              <div className="equal width fields">
                <div className="required field">
                  <label>CustomType ID</label>
                  <div className="flex">
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
              <div className="equal width fields" style={{ width: "50%" }}>
                <div className="field">
                  <label>Virtual Type</label>
                  <Select
                    value={form.virtualType}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        virtualType: value as "code" | "query" | undefined,
                      })
                    }
                    clearable
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="code (default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="code">code</SelectItem>
                      <SelectItem value="query">query</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {(form.type === "vector" || form.type === "vector[]") && (
              <div className="equal width fields">
                <div className="required field">
                  <label>Dimensions</label>
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
                <div className="equal width fields">
                  <div className="required field">
                    <label>Relation Type</label>
                    <Select
                      value={form.relationType ?? ""}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          relationType: value as
                            | "OneToOne"
                            | "BelongsToOne"
                            | "HasMany"
                            | "ManyToMany"
                            | undefined,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["OneToOne", "BelongsToOne", "HasMany", "ManyToMany"].map((k) => (
                          <SelectItem key={k} value={k}>
                            {k}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="required field">
                    <label>With</label>
                    <EntityIdSelect {...register("with")} search clearable />
                  </div>
                </div>
                <div className="equal width fields">
                  {form.relationType === "OneToOne" && (
                    <div className="field">
                      <label>HasJoinColumn</label>
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
                      <div className="required field">
                        <label>ON UPDATE</label>
                        <Select
                          value={form.onUpdate ?? ""}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              onUpdate: value as RelationOn | undefined,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EntityPropZodSchema.RelationOn.options.map((k) => (
                              <SelectItem key={k} value={k}>
                                {k}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="required field">
                        <label>ON DELETE</label>
                        <Select
                          value={form.onDelete ?? ""}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              onDelete: value as RelationOn | undefined,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EntityPropZodSchema.RelationOn.options.map((k) => (
                              <SelectItem key={k} value={k}>
                                {k}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {form.relationType === "HasMany" && (
                    <>
                      <div className="required field">
                        <label>JoinColumn</label>
                        <Input {...register("joinColumn")} />
                      </div>
                      <div className="field">
                        <label>FromColumn</label>
                        <Input {...register("fromColumn")} />
                      </div>
                    </>
                  )}
                  {form.relationType === "ManyToMany" && (
                    <div className="required field">
                      <label>JoinTable</label>
                      <Input {...register("joinTable")} />
                    </div>
                  )}
                </div>
                {form.relationType === "BelongsToOne" && (
                  <div className="equal width fields">
                    <div className="field">
                      <label>Custom JoinClause</label>
                      <Input {...register("customJoinClause")} />
                    </div>
                  </div>
                )}
              </>
            )}
          </form>

          <h5 className="ui small header">Debug: Form State</h5>
          <div className="ui secondary segment debug-form-state">
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
