import { camelize } from "inflection";
import { z } from "zod";
import { RenderingNode, TemplateKey, TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { RenderedTemplate } from "../syncer/syncer";
import { Template } from "./base-template";
import {
  getEnumInfoFromColName,
  getRelationPropFromColName,
} from "./view_list.template";
import { uniq } from "lodash";

export class Template__view_form extends Template {
  constructor() {
    super("view_form");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/pages/admin",
      path: `${names.fsPlural}/form.tsx`,
    };
  }

  wrapFC(body: string, label?: string): string {
    return [
      `<Form.Field>${label ? `\n   <label>${label}</label>` : ""}`,
      body,
      `</Form.Field>`,
    ].join("\n");
  }
  wrapFG(body: string, label?: string): string {
    return [
      `<Form.Group widths="equal">`,
      this.wrapFC(body, label),
      `</Form.Group>`,
    ].join("\n");
  }

  renderColumnImport(entityId: string, col: RenderingNode) {
    if (col.renderType === "enums") {
      const { id, targetMDNames } = getEnumInfoFromColName(entityId, col.name);
      const componentId = `${id}Select`;
      return `import { ${componentId} } from "src/components/${targetMDNames.fs}/${componentId}";`;
    } else if (col.renderType === "number-fk_id") {
      const relProp = getRelationPropFromColName(
        entityId,
        col.name.replace("_id", "")
      );
      const targetNames = EntityManager.getNamesFromId(relProp.with);
      const componentId = `${relProp.with}IdAsyncSelect`;
      return `import { ${componentId} } from "src/components/${targetNames.fs}/${componentId}";`;
    } else {
      throw new Error(`렌더 불가능한 임포트 ${col.name} ${col.renderType}`);
    }
  }

  renderColumn(
    entityId: string,
    col: RenderingNode,
    names: EntityNamesRecord,
    parent: string = ""
  ): string {
    let regExpr: string = "";
    regExpr = `{...register(\`${parent}${col.name}\`)}`;

    switch (col.renderType) {
      case "string-plain":
        if (
          col.zodType instanceof z.ZodString &&
          (col.zodType.maxLength ?? 0) <= 512
        ) {
          return `<Input placeholder="${col.label}" ${regExpr} />`;
        } else {
          return `<TextArea rows={8} placeholder="${col.label}" ${regExpr} />`;
        }
      case "string-datetime":
        return `<SQLDateTimeInput ${regExpr} />`;
      case "string-date":
        return `<SQLDateInput ${regExpr} />`;
      case "number-id":
        return `<input type="hidden" ${regExpr} />`;
      case "number-plain":
        return `<NumberInput placeholder="${col.label}" ${regExpr} />`;
      case "boolean":
        return `<BooleanToggle ${regExpr} />`;
      case "string-image":
        return `<ImageUploader multiple={false} ${regExpr} />`;
      case "array-images":
        return `<ImageUploader multiple={true} ${regExpr} maxSize={5} />`;
      case "enums":
        try {
          let enumId: string;
          if (col.name === "orderBy") {
            enumId = `${names.capital}${camelize(col.name)}Select`;
          } else {
            const { id } = getEnumInfoFromColName(entityId, col.name);
            enumId = `${id}Select`;
          }
          return `<${enumId} ${regExpr} ${
            col.optional || col.nullable ? "clearable" : ""
          } />`;
        } catch {
          return `<>찾을 수 없는 Enum ${col.name}</>`;
        }
      case "number-fk_id":
        try {
          const relProp = getRelationPropFromColName(
            entityId,
            col.name.replace("_id", "")
          );
          const fkId = `${relProp.with}IdAsyncSelect`;
          return `<${fkId} {...register('${col.name}')} ${
            col.optional || col.nullable ? "clearable" : ""
          } subset="A" />`;
        } catch {
          return `<>${col.name} 찾을 수 없음</>`;
        }
      case "array":
        return `<>${col.name} array</>`;
      case "object":
        return `<>${col.name} object</>`;
      default:
        throw new Error(
          `대응 불가능한 렌더 타입 ${col.renderType} on ${col.name}`
        );
    }
  }

  resolveDefaultValue(columns: RenderingNode[]): object {
    return columns.reduce((result, col) => {
      if (col.optional) {
        return result;
      }

      let value: unknown;
      if (col.nullable === true) {
        value = null;
      } else if (col.zodType instanceof z.ZodNumber) {
        value = 0;
      } else if (col.zodType instanceof z.ZodEnum) {
        value = Object.keys(col.zodType.Enum)[0];
      } else if (col.zodType instanceof z.ZodBoolean) {
        value = false;
      } else if (col.zodType instanceof z.ZodString) {
        if (col.renderType === "string-datetime") {
          value = "now()";
        } else {
          value = "";
        }
      } else if (col.zodType instanceof z.ZodArray) {
        value = [];
      } else if (col.zodType instanceof z.ZodObject) {
        value = {};
      }

      result[col.name] = value;
      return result;
    }, {} as { [key: string]: unknown });
  }

  render(
    { entityId }: TemplateOptions["view_form"],
    saveParamsNode: RenderingNode
  ) {
    const names = EntityManager.getNamesFromId(entityId);
    const columns = (saveParamsNode.children as RenderingNode[]).filter(
      (col) => col.name !== "id"
    );

    const defaultValue = this.resolveDefaultValue(columns);

    // 프리 템플릿
    const preTemplates: RenderedTemplate["preTemplates"] = (
      columns as RenderingNode[]
    )
      .filter((col) => {
        if (col.name === "id") {
          return false;
        } else if (col.name.endsWith("_id") || col.renderType === "number-id") {
          try {
            getRelationPropFromColName(entityId, col.name.replace("_id", ""));
            return true;
          } catch {
            return false;
          }
        } else if (col.renderType === "enums") {
          try {
            getEnumInfoFromColName(entityId, col.name);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      })
      .map((col) => {
        let key: TemplateKey;
        let targetMdId = entityId;
        let enumId: string | undefined;
        let idConstant: string | undefined;
        if (col.renderType === "enums") {
          key = "view_enums_select";
          const { targetMDNames, id, name } = getEnumInfoFromColName(
            entityId,
            col.name
          );
          targetMdId = targetMDNames.capital;
          enumId = id;
          idConstant = name;
        } else {
          key = "view_id_async_select";
          const relProp = getRelationPropFromColName(
            entityId,
            col.name.replace("_id", "")
          );
          targetMdId = relProp.with;
        }

        return {
          key: key as TemplateKey,
          options: {
            entityId: targetMdId,
            node: col,
            enumId,
            idConstant,
          },
        };
      })
      .filter((preTemplate) => {
        if (preTemplate.key === "view_id_async_select") {
          try {
            EntityManager.get(preTemplate.options.entityId);
            return true;
          } catch {
            return false;
          }
        }
        return true;
      });

    return {
      ...this.getTargetAndPath(names),
      body: `
import React, { useEffect, useState, Dispatch, SetStateAction, forwardRef, Ref, useImperativeHandle, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Checkbox,
  Form,
  Header,
  Input,
  Segment,
  TextArea,
  Label,
} from 'semantic-ui-react';
import { DateTime } from "luxon";

import { BackLink, LinkInput, NumberInput, BooleanToggle, SQLDateTimeInput, SQLDateInput, useTypeForm, useGoBack } from "@sonamu-kit/react-sui";
import { defaultCatch } from 'src/services/sonamu.shared';
import { ImageUploader } from 'src/components/core/ImageUploader';
import { useCommonModal } from "src/components/core/CommonModal";

import { ${names.capital}SaveParams } from 'src/services/${names.fs}/${
        names.fs
      }.types';
import { ${names.capital}Service } from 'src/services/${names.fs}/${
        names.fs
      }.service';
import { ${names.capital}SubsetA } from 'src/services/${names.fs}/${
        names.fs
      }.generated';
${uniq(
  columns
    .filter((col) => ["number-fk_id", "enums"].includes(col.renderType))
    .map((col) => {
      return this.renderColumnImport(entityId, col);
    })
).join("\n")}

export default function ${names.capitalPlural}FormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get('id') ?? undefined,
  };

  return <${
    names.capitalPlural
  }Form id={query?.id ? Number(query.id) : undefined} />;
}
type ${names.capitalPlural}FormProps = {
  id?: number;
  mode?: 'page' | 'modal';
};
export function ${names.capitalPlural}Form({ id, mode }: ${
        names.capitalPlural
      }FormProps) {
  // 편집시 기존 row
  const [row, setRow] = useState<${names.capital}SubsetA | undefined>();

  // ${names.capital}SaveParams 폼
  const { form, setForm, register } = useTypeForm(${
    names.capital
  }SaveParams, ${JSON.stringify(defaultValue).replace(
        /"now\(\)"/g,
        "DateTime.local().toSQL().slice(0, 19)"
      )});

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      ${names.capital}Service.get${names.capital}('A', id).then((row) => {
        setRow(row);
        setForm({
          ...row,
          ${columns
            .filter((col) => col.renderType === "number-fk_id")
            .map((col) => {
              if (col.nullable) {
                return `${col.name}: row.${col.name.replace(
                  "_id",
                  "?.id"
                )} ?? null`;
              } else {
                return `${col.name}: row.${col.name.replace("_id", ".id")}`;
              }
            })
            .join(",\n")}
        });
      });
    }
  }, [id]);

  // CommonModal
  const { doneModal, closeModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    ${names.capital}Service.save([form]).then(([id]) => {
      if( mode === 'modal' ) {
        doneModal();
      } else {
        goBack('/admin/${names.fsPlural}');
      }
    }).catch(defaultCatch);
  }, [ form, mode, id ]);

  // 페이지
  const PAGE = {
    title: \`${names.capital}\${id ? \`#\${id} 수정\` : ' 등록'}\`,
  }

  return (
    <div className="form">
      <Segment padded basic>
        <Segment padded color="grey">
          <div className="header-row">
            <Header>
              {PAGE.title}
            </Header>
            { mode !== 'modal' && <div className="buttons">
              <BackLink primary size="tiny" to="/admin/${
                names.fsPlural
              }" content="목록" icon="list" />
            </div>}
          </div>
          <Form>
            ${columns
              .map((col) => {
                if (col.name === "created_at") {
                  return `{form.id && (${this.wrapFG(
                    `<div className="p-8">{form.${col.name}}</div>`,
                    "등록일시"
                  )})}`;
                } else {
                  return this.wrapFG(
                    this.renderColumn(entityId, col, names),
                    col.label
                  );
                }
              })
              .join("\n")}
            <Segment basic textAlign="center">
              <Button type="submit" primary onClick={handleSubmit} content="저장" icon="save" />
            </Segment>
          </Form>
        </Segment>
      </Segment>
    </div>
  );
};
      `.trim(),
      importKeys: [],
      preTemplates,
    };
  }
}
