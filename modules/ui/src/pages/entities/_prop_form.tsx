import { useCommonModal } from "../../components/core/CommonModal";
import {
  Button,
  Divider,
  Dropdown,
  Form,
  Header,
  Input,
  Label,
  Segment,
} from "semantic-ui-react";
import { BooleanToggle, NumberInput, useTypeForm } from "@sonamu-kit/react-sui";
import { z } from "zod";
import { EntityProp } from "sonamu";
import { useEffect } from "react";
import { EntityPropZodSchema } from "../../services/entity-prop-zod-schema";
import { TypeIdAsyncSelect } from "../../components/TypeIdAsyncSelect";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { defaultCatch } from "../../services/sonamu.shared";
import { InputWithSuggestion } from "../../components/InputWithSuggestion";

type EntityPropFormProps = { entityId: string; oldOne?: EntityProp };
export function EntityPropForm({ entityId, oldOne }: EntityPropFormProps) {
  // CommonModal
  const { doneModal } = useCommonModal();

  // TypeForm
  const { form, setForm, register } = useTypeForm(
    z.object({
      name: z.string(),
      type: z.string(),
      desc: z.string().optional(),
      nullable: z.boolean().optional(),
      toFilter: z.boolean().optional(),
      dbDefault: z.string().optional(),
      length: z.number().optional(),
      unsigned: z.boolean().optional(),
      textType: z.enum(["text", "mediumtext", "longtext"]).optional(),
      precision: z.number().optional(),
      scale: z.number().optional(),
      id: z.string().optional(),
      as: z.union([z.object({ ref: z.string() }), z.any()]).optional(),
      relationType: z
        .enum(["OneToOne", "BelongsToOne", "HasMany", "ManyToMany"])
        .optional(),
      customJoinClause: z.string().optional(),
      hasJoinColumn: z.boolean().optional(),
      joinColumn: z.string().optional(),
      joinTable: z.string().optional(),
      onUpdate: EntityPropZodSchema.RelationOn.optional(),
      onDelete: EntityPropZodSchema.RelationOn.optional(),
      with: z.string().optional(),
    }),
    {
      name: "",
      type: "",
      desc: "",
      ...oldOne,
    }
  );

  const typeOptions = [
    "string",
    "enum",
    "text",
    "integer",
    "bigInteger",
    "boolean",
    "float",
    "double",
    "decimal",
    "date",
    "time",
    "datetime",
    "timestamp",
    "json",
    "virtual",
    "relation",
  ].map((type) => ({
    key: type,
    value: type,
    text: type,
  }));

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

  // 타입이 변경되었을 때 Validation 처리
  useEffect(() => {
    const result = EntityPropZodSchema.safeParse(form);
    if (result.success) {
      setForm(result.data);
    }
  }, [form.type, form.relationType]);

  const handleSubmit = () => {
    const result = EntityPropZodSchema.safeParse(form);
    if (!result.success) {
      alert("Validation Error");
      console.error(result.error);
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
    <div className="form entity-prop-form">
      <Segment padded basic>
        <Segment padded color="green">
          <div className="header-row">
            <Header>EntityProp Form</Header>
          </div>
          <Segment basic>
            <code>{JSON.stringify(form)}</code>
            <br />
            <Form>
              <Form.Group widths="equal">
                <Form.Field>
                  <label>Type</label>
                  <Dropdown
                    {...register("type")}
                    search
                    selection
                    options={typeOptions}
                    className="focus-2"
                  />
                </Form.Field>
                <Form.Field>
                  <label>Name</label>
                  <Input {...register("name")} className="focus-0" />
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
                  <label>DB Default</label>
                  <Input
                    {...register("dbDefault")}
                    className="focus-5"
                    labelPosition="left"
                    label={
                      <Label>
                        {(() => {
                          if (form.dbDefault === undefined) {
                            return "undefined";
                          } else if (
                            Number.isNaN(Number(form.dbDefault)) === false
                          ) {
                            return "number";
                          } else if (
                            form.dbDefault.startsWith('"') &&
                            form.dbDefault.endsWith('"')
                          ) {
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
              <Divider />
              {(form.type === "string" || form.type === "enum") && (
                <Form.Group widths="equal">
                  <Form.Field>
                    <label>Length</label>
                    <NumberInput {...register("length")} />
                  </Form.Field>
                  {form.type === "enum" ? (
                    <Form.Field>
                      <label>Enum ID</label>
                      <div className="flex">
                        <TypeIdAsyncSelect
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
              {form.type === "text" && (
                <Form.Group widths="equal">
                  <Form.Field>
                    <label>Text Type</label>
                    <Dropdown
                      {...register("textType")}
                      search
                      selection
                      options={["text", "mediumtext", "longtext"].map((k) => ({
                        key: k,
                        value: k,
                        text: k.toUpperCase(),
                      }))}
                    />
                  </Form.Field>
                </Form.Group>
              )}
              {(form.type === "integer" ||
                form.type === "bigInteger" ||
                form.type === "float" ||
                form.type === "double" ||
                form.type === "decimal") && (
                <Form.Group widths="equal">
                  <Form.Field>
                    <label>Unsigned</label>
                    <BooleanToggle {...register("unsigned")} />
                  </Form.Field>
                  {(form.type === "float" ||
                    form.type === "double" ||
                    form.type === "decimal") && (
                    <>
                      <Form.Field>
                        <label>Precision</label>
                        <NumberInput {...register("precision")} />
                      </Form.Field>
                      <Form.Field>
                        <label>Scale</label>
                        <NumberInput {...register("scale")} />
                      </Form.Field>
                    </>
                  )}
                </Form.Group>
              )}
              {(form.type === "json" || form.type === "virtual") && (
                <Form.Group widths="equal">
                  <Form.Field>
                    <label>CustomType ID</label>
                    <div className="flex">
                      <TypeIdAsyncSelect {...register("id")} search />
                      <Button
                        icon="code"
                        size="mini"
                        onClick={() => openVscodePreset("types")}
                      />
                    </div>
                  </Form.Field>
                </Form.Group>
              )}
              {form.type === "relation" && (
                <>
                  <Form.Group widths="equal">
                    <Form.Field>
                      <label>Relation Type</label>
                      <Dropdown
                        {...register("relationType")}
                        search
                        selection
                        options={[
                          "OneToOne",
                          "BelongsToOne",
                          "HasMany",
                          "ManyToMany",
                        ].map((k) => ({
                          key: k,
                          value: k,
                          text: k,
                        }))}
                      />
                    </Form.Field>
                    <Form.Field>
                      <label>With</label>
                      <Input {...register("with")} className="focus-4" />
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
                        <Form.Field>
                          <label>ON UPDATE</label>
                          <Dropdown
                            {...register("onUpdate")}
                            search
                            selection
                            options={EntityPropZodSchema.RelationOn.options.map(
                              (k) => ({
                                key: k,
                                value: k,
                                text: k,
                              })
                            )}
                          />
                        </Form.Field>
                        <Form.Field>
                          <label>ON DELETE</label>
                          <Dropdown
                            {...register("onDelete")}
                            search
                            selection
                            options={EntityPropZodSchema.RelationOn.options.map(
                              (k) => ({
                                key: k,
                                value: k,
                                text: k,
                              })
                            )}
                          />
                        </Form.Field>
                      </>
                    )}
                    {form.relationType === "HasMany" && (
                      <Form.Field>
                        <label>JoinColumn</label>
                        <Input {...register("joinColumn")} />
                      </Form.Field>
                    )}
                    {form.relationType === "ManyToMany" && (
                      <Form.Field>
                        <label>JoinTable</label>
                        <Input {...register("joinTable")} />
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
            <Button type="submit" primary onClick={handleSubmit}>
              Save
            </Button>
          </Segment>
        </Segment>
      </Segment>
    </div>
  );
}
