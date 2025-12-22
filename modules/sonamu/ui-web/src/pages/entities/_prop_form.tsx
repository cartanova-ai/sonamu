import { BooleanToggle, FormNumberInput, useTypeForm } from "@sonamu-kit/react-sui";
import { useEffect } from "react";
import { Button, Divider, Form, Header, Input, Label, Segment } from "semantic-ui-react";
import type { EntityProp } from "sonamu";
import { z } from "zod";
import { useCommonModal } from "../../components/core/CommonModal";
import { EntityIdSelect } from "../../components/EntityIdSelect";
import { FormTypeIdAsyncSelect } from "../../components/FormTypeIdAsyncSelect";
import { InputWithSuggestion } from "../../components/InputWithSuggestion";
import { EntityPropZodSchema } from "../../services/entity-prop-zod-schema";
import { defaultCatch } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";

type EntityPropFormProps = {
  entityId: string;
  oldOne?: EntityProp;
};
export function EntityPropForm({ entityId, oldOne }: EntityPropFormProps) {
  // CommonModal
  const { doneModal } = useCommonModal();

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
    {
      name: "",
      type: "",
      desc: "",
      ...oldOne,
    },
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
    "uuid",
    "vector",
    "vector[]",
    "virtual",
    "relation",
    "tsvector",
  ].map((type) => ({
    key: type,
    value: type,
    text: type,
  }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: form 변경시에만 keydown 갱신
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: 타입이 변경되었을 때 Validation 처리
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
      result.error.issues.forEach((issue: z.core.$ZodIssue) => {
        if (issue.path.length) {
          addError(issue.path[0].toString(), {
            content: issue.message,
            pointing: "above",
          });
        }
        if (issue.code === "invalid_union") {
          issue.errors.flat().forEach((error: z.core.$ZodIssue) => {
            if (error.path.length) {
              addError(error.path[0].toString(), {
                content: error.message,
                pointing: "above",
              });
            }
          });
        }
      });
      return;
    }

    doneModal(result.data);
  };

  const openVscodePreset = (preset: "types") => {
    SonamuUIService.openVscode({
      entityId,
      preset,
    }).catch(defaultCatch);
  };

  return (
    <div className="form entity-prop-form entity-form-container">
      <div className="form-header">
        <Header>EntityProp Form</Header>
      </div>

      <div className="form-body">
        <Form>
          <Form.Group widths="equal">
            <Form.Field required>
              <label>Type</label>
              <Form.Dropdown
                {...register("type")}
                search
                selection
                options={typeOptions}
                className="focus-2"
              />
            </Form.Field>
            <Form.Field required>
              <label>Name</label>
              <Form.Input {...register("name")} className="focus-0" />
            </Form.Field>
            <Form.Field>
              <label>Description</label>
              <InputWithSuggestion
                {...register("desc")}
                className="focus-1"
                origin={form.name}
                entityId={entityId}
              />
            </Form.Field>
          </Form.Group>
          <Form.Group widths="equal">
            <Form.Field>
              <label>Nullable</label>
              <BooleanToggle {...register("nullable")} />
            </Form.Field>
            <Form.Field>
              <label>To Filter</label>
              <BooleanToggle {...register("toFilter")} />
            </Form.Field>
            <Form.Field>
              <label>Generated</label>
              <BooleanToggle
                value={form.generated !== undefined}
                onChange={(_, { value }) => {
                  if (value) {
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
            </Form.Field>
            <Form.Field>
              <label>DB Default</label>
              <Input
                {...register("dbDefault")}
                className="focus-5"
                labelPosition="left"
                disabled={form.generated !== undefined}
                label={
                  <Label>
                    {(() => {
                      if (form.dbDefault === undefined) {
                        return "undefined";
                      } else if (Number.isNaN(Number(form.dbDefault)) === false) {
                        return "number";
                      } else if (form.dbDefault.startsWith('"') && form.dbDefault.endsWith('"')) {
                        return "string";
                      } else {
                        return "raw";
                      }
                    })()}
                  </Label>
                }
              />
            </Form.Field>
          </Form.Group>
          {form.generated && (
            <Form.Group widths="equal">
              <Form.Field required style={{ flex: 2 }}>
                <label>Storage Type</label>
                <Form.Dropdown
                  value={form.generated?.type ?? "STORED"}
                  onChange={(_, { value }) => {
                    const newGenerated = {
                      type: value as "STORED" | "VIRTUAL",
                      expression: form.generated?.expression ?? "",
                    };
                    setForm({ ...form, generated: newGenerated });
                  }}
                  selection
                  options={[
                    { key: "STORED", value: "STORED", text: "STORED" },
                    { key: "VIRTUAL", value: "VIRTUAL", text: "VIRTUAL" },
                  ]}
                />
              </Form.Field>
              <Form.Field required>
                <label>Generation Expression</label>
                <Input
                  value={form.generated?.expression ?? ""}
                  onChange={(_, { value }) => {
                    const newGenerated = {
                      type: form.generated?.type ?? "STORED",
                      expression: value,
                    };
                    setForm({ ...form, generated: newGenerated });
                  }}
                  placeholder="예: price * 1.1"
                />
              </Form.Field>
            </Form.Group>
          )}
          <Divider />
          {(form.type === "string" ||
            form.type === "string[]" ||
            form.type === "enum" ||
            form.type === "enum[]") && (
            <Form.Group widths="equal">
              {form.type === "string" && (
                <Form.Field>
                  <label>Length</label>
                  <FormNumberInput {...register("length", "nullable")} />
                </Form.Field>
              )}
              {form.type === "enum" ? (
                <Form.Field required>
                  <label>Enum ID</label>
                  <div className="flex">
                    <FormTypeIdAsyncSelect
                      {...register("id")}
                      search
                      filter="enums"
                      withAddEnumButton={{ entityId, propName: form.name }}
                    />
                  </div>
                </Form.Field>
              ) : (
                <Form.Field>&nbsp;</Form.Field>
              )}
            </Form.Group>
          )}
          {(form.type === "integer" ||
            form.type === "integer[]" ||
            form.type === "bigInteger" ||
            form.type === "bigInteger[]" ||
            form.type === "number" ||
            form.type === "number[]" ||
            form.type === "numeric" ||
            form.type === "numeric[]") && (
            <Form.Group widths="equal">
              {form.type === "number" && (
                <Form.Field>
                  <label>Number Type</label>
                  <Form.Dropdown
                    {...register("numberType")}
                    search
                    selection
                    options={["real", "double precision", "numeric"].map((k) => ({
                      key: k,
                      value: k,
                      text: k,
                    }))}
                  />
                </Form.Field>
              )}
              {(form.type === "numeric" ||
                (form.type === "number" && form.numberType === "numeric")) && (
                <>
                  <Form.Field required>
                    <label>Precision</label>
                    <FormNumberInput {...register("precision")} />
                  </Form.Field>
                  <Form.Field required>
                    <label>Scale</label>
                    <FormNumberInput {...register("scale")} />
                  </Form.Field>
                </>
              )}
            </Form.Group>
          )}
          {(form.type === "json" || form.type === "virtual") && (
            <Form.Group widths="equal">
              <Form.Field required>
                <label>CustomType ID</label>
                <div className="flex">
                  <FormTypeIdAsyncSelect {...register("id")} search />
                  <Button icon="code" size="mini" onClick={() => openVscodePreset("types")} />
                </div>
              </Form.Field>
            </Form.Group>
          )}
          {form.type === "virtual" && (
            <Form.Group widths="equal" style={{ width: "50%" }}>
              <Form.Field>
                <label>Virtual Type</label>
                <Form.Dropdown
                  {...register("virtualType")}
                  selection
                  options={[
                    { key: "code", value: "code", text: "code" },
                    { key: "query", value: "query", text: "query" },
                  ]}
                  placeholder="code (default)"
                />
              </Form.Field>
            </Form.Group>
          )}
          {(form.type === "vector" || form.type === "vector[]") && (
            <Form.Group widths="equal">
              <Form.Field required>
                <label>Dimensions</label>
                <FormNumberInput {...register("dimensions")} placeholder="예: 1024 (Voyage-3)" />
              </Form.Field>
            </Form.Group>
          )}
          {form.type === "relation" && (
            <>
              <Form.Group widths="equal">
                <Form.Field required>
                  <label>Relation Type</label>
                  <Form.Dropdown
                    {...register("relationType")}
                    search
                    selection
                    options={["OneToOne", "BelongsToOne", "HasMany", "ManyToMany"].map((k) => ({
                      key: k,
                      value: k,
                      text: k,
                    }))}
                  />
                </Form.Field>
                <Form.Field required>
                  <label>With</label>
                  <EntityIdSelect {...register("with")} search clearable />
                </Form.Field>
              </Form.Group>
              <Form.Group widths="equal">
                {form.relationType === "OneToOne" && (
                  <Form.Field>
                    <label>HasJoinColumn</label>
                    <BooleanToggle {...register("hasJoinColumn")} />
                  </Form.Field>
                )}
                {(form.hasJoinColumn ||
                  form.relationType === "BelongsToOne" ||
                  form.relationType === "ManyToMany") && (
                  <>
                    <Form.Field required>
                      <label>ON UPDATE</label>
                      <Form.Dropdown
                        {...register("onUpdate")}
                        search
                        selection
                        options={EntityPropZodSchema.RelationOn.options.map((k) => ({
                          key: k,
                          value: k,
                          text: k,
                        }))}
                      />
                    </Form.Field>
                    <Form.Field required>
                      <label>ON DELETE</label>
                      <Form.Dropdown
                        {...register("onDelete")}
                        search
                        selection
                        options={EntityPropZodSchema.RelationOn.options.map((k) => ({
                          key: k,
                          value: k,
                          text: k,
                        }))}
                      />
                    </Form.Field>
                  </>
                )}
                {form.relationType === "HasMany" && (
                  <>
                    <Form.Field required>
                      <label>JoinColumn</label>
                      <Form.Input {...register("joinColumn")} />
                    </Form.Field>
                    <Form.Field>
                      <label>FromColumn</label>
                      <Input {...register("fromColumn")} />
                    </Form.Field>
                  </>
                )}
                {form.relationType === "ManyToMany" && (
                  <Form.Field required>
                    <label>JoinTable</label>
                    <Form.Input {...register("joinTable")} />
                  </Form.Field>
                )}
              </Form.Group>
              {form.relationType === "BelongsToOne" && (
                <Form.Group widths="equal">
                  <Form.Field>
                    <label>Custom JoinClause</label>
                    <Input {...register("customJoinClause")} />
                  </Form.Field>
                </Form.Group>
              )}
            </>
          )}
        </Form>

        <Header size="small">Debug: Form State</Header>
        <Segment secondary className="debug-form-state">
          <pre>{JSON.stringify(form, null, 2)}</pre>
        </Segment>
      </div>

      <div className="form-footer">
        <Button type="submit" primary onClick={handleSubmit}>
          Save
        </Button>
      </div>
    </div>
  );
}
