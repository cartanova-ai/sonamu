import { camelize } from "inflection";
import { z } from "zod";
import { RenderingNode, TemplateKey, TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { RenderedTemplate } from "../syncer/syncer";
import { Template } from "./base-template";
import {
  getEnumInfoFromColName,
  getRelationPropFromColName,
} from "./view_list.template";

export class Template__view_form extends Template {
  constructor() {
    super("view_form");
  }

  getTargetAndPath(names: SMDNamesRecord) {
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

  renderColumnImport(smdId: string, col: RenderingNode) {
    if (col.renderType === "enums") {
      const { id, targetMDNames } = getEnumInfoFromColName(smdId, col.name);
      const componentId = `${id}Select`;
      return `import { ${componentId} } from "src/components/${targetMDNames.fs}/${componentId}";`;
    } else if (col.renderType === "number-fk_id") {
      const relProp = getRelationPropFromColName(
        smdId,
        col.name.replace("_id", "")
      );
      const targetNames = SMDManager.getNamesFromId(relProp.with);
      const componentId = `${relProp.with}IdAsyncSelect`;
      return `import { ${componentId} } from "src/components/${targetNames.fs}/${componentId}";`;
    } else {
      throw new Error(`렌더 불가능한 임포트 ${col.name} ${col.renderType}`);
    }
  }

  renderColumn(
    smdId: string,
    col: RenderingNode,
    names: SMDNamesRecord,
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
            const { id } = getEnumInfoFromColName(smdId, col.name);
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
            smdId,
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
        return `{form.${col.name}.map((elem, index) => ${this.renderColumn(
          smdId,
          col.element!,
          names,
          `${parent}${col.name}[\${index}]`
        )})}`;
      case "object":
        return (
          `<Form.Group className="${col.name}"${
            parent !== "" ? " key={index}" : ""
          }>` +
          col
            .children!.map((child) =>
              this.wrapFC(
                this.renderColumn(smdId, child, names, `${parent}.`),
                child.label
              )
            )
            .join("\n") +
          "</Form.Group>"
        );
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
    { smdId }: TemplateOptions["view_form"],
    saveParamsNode: RenderingNode
  ) {
    const names = SMDManager.getNamesFromId(smdId);
    const columns = (saveParamsNode.children as RenderingNode[]).filter(
      (col) => col.name !== "id"
    );

    const defaultValue = this.resolveDefaultValue(columns);

    // 프리 템플릿
    const preTemplates: RenderedTemplate["preTemplates"] = (
      columns as RenderingNode[]
    )
      .filter((col) => {
        if (
          col.name !== "id" &&
          (["enums", "number-id"].includes(col.renderType) ||
            col.name.endsWith("_id"))
        ) {
          try {
            getRelationPropFromColName(smdId, col.name.replace("_id", ""));
          } catch {
            return false;
          }
          return true;
        } else {
          return false;
        }
      })
      .map((col) => {
        let key: TemplateKey;
        let targetMdId = smdId;
        if (col.renderType === "enums") {
          key = "view_enums_select";
        } else {
          key = "view_id_async_select";
          const relProp = getRelationPropFromColName(
            smdId,
            col.name.replace("_id", "")
          );
          targetMdId = relProp.with;
        }

        return {
          key: key as TemplateKey,
          options: {
            smdId: targetMdId,
            node: col,
          },
        };
      })
      .filter((preTemplate) => {
        if (preTemplate.key === "view_id_async_select") {
          try {
            SMDManager.get(preTemplate.options.smdId);
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
import React, { useEffect, useState, Dispatch, SetStateAction } from 'react';
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

import { BackLink } from 'src/typeframe/components/BackLink';
import { LinkInput } from 'src/typeframe/components/LinkInput';
import { ImageUploader } from 'src/typeframe/components/ImageUploader';
import { NumberInput } from 'src/typeframe/components/NumberInput';
import { BooleanToggle } from 'src/typeframe/components/BooleanToggle';
import { SQLDateTimeInput } from "src/typeframe/components/SQLDateTimeInput";
import { defCatch } from 'src/typeframe/fetch';

import { ${names.capital}SaveParams } from 'src/services/${names.fs}/${
        names.fs
      }.types';
import { useTypeForm, useGoBack } from 'src/typeframe/helpers';
import { usePubSub } from 'src/typeframe/pubsub';
import { ${names.capital}Service } from 'src/services/${names.fs}/${
        names.fs
      }.service';
import { ${names.capital}SubsetA } from 'src/services/${names.fs}/${
        names.fs
      }.generated';
${columns
  .filter((col) => ["number-fk_id", "enums"].includes(col.renderType))
  .map((col) => {
    return this.renderColumnImport(smdId, col);
  })
  .join("\n")}

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
        '"now()"',
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

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = () => {
    ${names.capital}Service.save([form]).then(([id]) => {
      if (mode !== 'modal') {
        goBack('/admin/${names.fsPlural}');
      }
    }).catch(defCatch);
  };

  // 모달 서브밋 핸들링
  const { subscribe } = usePubSub();
  useEffect(() => {
    if (id) {
      return subscribe(\`${names.fs}#\${id}.submitted\`, () => {
        handleSubmit();
      });
    }
  }, [form]);

  return (
    <div className="form">
      <Segment padded basic>
        <Segment padded color="grey">
          <div className="header-row">
            <Header>
              ${names.capital}{id ? \`#\${id} 수정 폼\` : ' 작성 폼'}
            </Header>
            <div className="buttons">
              <BackLink primary size="tiny" to="/admin/${names.fsPlural}">
                목록
              </BackLink>
            </div>
          </div>
          <Form>
            ${columns
              .map((col) =>
                this.wrapFG(this.renderColumn(smdId, col, names), col.label)
              )
              .join("\n")}
            {mode !== 'modal' && (
              <Segment basic textAlign="center">
                <Button type="submit" primary onClick={handleSubmit}>
                  저장
                </Button>
              </Segment>
            )}
          </Form>
        </Segment>
      </Segment>
    </div>
  );
}
      `.trim(),
      importKeys: [],
      preTemplates,
    };
  }
}
