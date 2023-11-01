import { camelize, underscore } from "inflection";
import { flattenDeep, uniq } from "lodash";
import { z } from "zod";
import { RenderingNode, TemplateKey, TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { isEnumProp, isRelationProp, RelationProp } from "../types/types";
import { RenderedTemplate } from "../syncer/syncer";
import { Template } from "./base-template";

export class Template__view_list extends Template {
  constructor() {
    super("view_list");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/pages/admin",
      path: `${names.fsPlural}/index.tsx`,
    };
  }

  wrapTc(
    body: string,
    key: string,
    collapsing: boolean = true,
    className: string = ""
  ) {
    return `<Table.Cell key="${key}"${collapsing ? " collapsing" : ""}${
      className ? ` className={\`${className}\`}` : ""
    }>${body}</Table.Cell>`;
  }

  renderColumn(
    entityId: string,
    col: RenderingNode,
    names: EntityNamesRecord,
    parentObj: string = "row",
    withoutName: boolean = false
  ): string {
    const colName = withoutName ? `${parentObj}` : `${parentObj}.${col.name}`;

    switch (col.renderType) {
      case "string-plain":
      case "string-date":
      case "number-id":
        return `<>{${colName}}</>`;
      case "number-fk_id":
        const relPropFk = getRelationPropFromColName(
          entityId,
          col.name.replace("_id", "")
        );
        return `<>${relPropFk.with}#{${colName}}</>`;
      case "string-image":
        return `<>{${
          col.nullable ? `${colName} && ` : ""
        }<img src={${colName}} />}</>`;
      case "string-datetime":
        if (col.nullable) {
          return `<span className="text-tiny">{${colName} === null ? '-' : dateF(${colName})}</span>`;
        } else {
          return `<span className="text-tiny">{dateF(${colName})}</span>`;
        }
      case "boolean":
        return `<>{${colName} ? <Label color='green' circular>O</Label> : <Label color='grey' circular>X</Label> }</>`;
      case "enums":
        const { id: enumId } = getEnumInfoFromColName(entityId, col.name);
        return `<>{${
          col.nullable ? `${colName} && ` : ""
        }${enumId}Label[${colName}]}</>`;
      case "array-images":
        return `<>{ ${colName}.map(r => ${
          col.nullable ? `r && ` : ""
        }<img src={r} />) }</>`;
      case "number-plain":
        return `<>{${col.nullable ? `${colName} && ` : ""}numF(${colName})}</>`;
      case "object":
        return `<>{/* object ${colName} */}</>`;
      case "object-pick":
        const pickedChild = col.children!.find(
          (child) => child.name === col.config?.picked
        );
        if (!pickedChild) {
          throw new Error(`object-pick 선택 실패 (오브젝트: ${col.name})`);
        }
        return this.renderColumn(
          entityId,
          pickedChild,
          names,
          `${colName}${col.nullable ? "?" : ""}`
        );
      case "array":
        return `<>{ /* array ${colName} */ }</>`;
      default:
        throw new Error(`렌더 불가 컬럼 ${col.renderType}`);
    }
  }

  renderColumnImport(
    entityId: string,
    col: RenderingNode,
    names: EntityNamesRecord
  ): (string | null)[] {
    if (col.renderType === "enums") {
      const { id: enumId } = getEnumInfoFromColName(names.capital, col.name);
      return [
        `import { ${enumId}Label } from 'src/services/sonamu.generated';`,
      ];
    } else if (col.renderType === "object") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name);
        const result = col.children!.map((child) => {
          entityId = relProp.with;
          names = EntityManager.getNamesFromId(relProp.with);
          return this.renderColumnImport(entityId, child, names);
        });
        return flattenDeep(result);
      } catch {
        return [null];
      }
    } else if (col.renderType === "array") {
      return this.renderColumnImport(entityId, col.element!, names);
    }

    return [null];
  }

  renderFilterImport(
    entityId: string,
    col: RenderingNode,
    names: EntityNamesRecord
  ) {
    if (col.name === "search") {
      return `import { ${names.capital}SearchInput } from "src/components/${names.fs}/${names.capital}SearchInput";`;
    } else if (col.renderType === "enums") {
      if (col.name === "orderBy") {
        const componentId = `${names.capital}${camelize(col.name)}Select`;
        return `import { ${componentId} } from "src/components/${names.fs}/${componentId}";`;
      } else {
        try {
          const { id, targetEntityNames: targetMDNames } =
            getEnumInfoFromColName(entityId, col.name);
          const componentId = `${id}Select`;
          return `import { ${componentId} } from "src/components/${targetMDNames.fs}/${componentId}";`;
        } catch {
          return "";
        }
      }
    } else if (col.renderType === "number-fk_id") {
      try {
        const relProp = getRelationPropFromColName(
          entityId,
          col.name.replace("_id", "")
        );
        const targetNames = EntityManager.getNamesFromId(relProp.with);
        const componentId = `${relProp.with}IdAsyncSelect`;
        return `import { ${componentId} } from "src/components/${targetNames.fs}/${componentId}";`;
      } catch {
        return "";
      }
    } else {
      throw new Error(
        `렌더 불가능한 필터 임포트 ${col.name} ${col.renderType}`
      );
    }
  }

  renderFilter(entityId: string, col: RenderingNode, names: EntityNamesRecord) {
    if (col.name === "search") {
      return "";
    }

    const isClearable = col.optional === true && col.name !== "orderBy";
    let componentId: string;
    if (col.renderType === "enums") {
      if (col.name === "orderBy") {
        componentId = `${names.capital}${camelize(col.name)}Select`;
      } else {
        try {
          const { id } = getEnumInfoFromColName(entityId, col.name);
          componentId = `${id}Select`;
        } catch {
          return "";
        }
      }
      return `<${componentId} {...register('${col.name}')} ${
        isClearable ? "clearable" : ""
      } />`;
    } else if (col.renderType === "number-fk_id") {
      try {
        const relProp = getRelationPropFromColName(
          entityId,
          col.name.replace("_id", "")
        );
        componentId = `${relProp.with}IdAsyncSelect`;
        return `<${componentId} {...register('${col.name}')} ${
          isClearable ? "clearable" : ""
        } subset="A" />`;
      } catch {
        return "";
      }
    } else {
      throw new Error(
        `렌더 불가능한 필터 임포트 ${col.name} ${col.renderType}`
      );
    }
  }

  getDefault(columns: RenderingNode[]): {
    orderBy: string;
    search: string;
  } {
    const def = {
      orderBy: "id-desc",
      search: "title",
    };
    const orderByZodType = columns.find(
      (col) => col.name === "orderBy"
    )?.zodType;
    if (orderByZodType && orderByZodType instanceof z.ZodEnum) {
      def.orderBy = Object.keys(orderByZodType.Enum)[0];
    }
    const searchZodType = columns.find((col) => col.name === "search")?.zodType;
    if (searchZodType && searchZodType instanceof z.ZodEnum) {
      def.search = Object.keys(searchZodType.Enum)[0];
    }
    return def;
  }

  render(
    { entityId }: TemplateOptions["view_list"],
    columnsNode: RenderingNode,
    listParamsNode: RenderingNode
  ) {
    const names = EntityManager.getNamesFromId(entityId);
    const entity = EntityManager.get(entityId);

    // 실제 리스트 컬럼
    const columns = (columnsNode.children as RenderingNode[])
      .filter((col) => col.name !== "id")
      .map((col) => {
        const propCandidate = entity.props.find((p) => p.name === col.name);
        return {
          name: col.name,
          label: propCandidate?.desc ?? col.label,
          tc: `(row) => ${this.renderColumn(entityId, col, names)}`,
        };
      });

    // 필터 컬럼
    const filterColumns = (listParamsNode.children as RenderingNode[])
      .filter(
        (col) =>
          col.name !== "id" &&
          col.name !== "queryMode" &&
          (["enums", "number-id"].includes(col.renderType) ||
            col.name.endsWith("_id"))
      )
      // orderBy가 가장 뒤로 오게 순서 조정
      .sort((a) => {
        return a.name == "orderBy" ? 1 : -1;
      });

    // 필터 컬럼을 프리 템플릿으로 설정
    const preTemplates: RenderedTemplate["preTemplates"] = [];
    for (let col of filterColumns) {
      let key: TemplateKey;
      let targetEntityId = entityId;
      let enumId: string | undefined;

      if (col.renderType === "enums") {
        if (col.name === "search") {
          key = "view_enums_dropdown";
          enumId = `${names.capital}SearchField`;
          targetEntityId = names.capital;
        } else {
          key = "view_enums_select";
          try {
            const { targetEntityNames, id } = getEnumInfoFromColName(
              entityId,
              col.name
            );
            targetEntityId = targetEntityNames.capital;
            enumId = id;
          } catch {
            continue;
          }
        }
      } else {
        key = "view_id_async_select";
        try {
          const relProp = getRelationPropFromColName(
            entityId,
            col.name.replace("_id", "")
          );
          targetEntityId = relProp.with;
        } catch {
          continue;
        }
      }

      preTemplates.push({
        key,
        options: {
          entityId: targetEntityId,
          enumId,
        },
      });
    }

    // 리스트 컬럼
    const columnImports = uniq(
      columnsNode
        .children!.map((col) => {
          return this.renderColumnImport(entityId, col, names);
        })
        .flat()
        .filter((col) => col !== null)
    ).join("\n");

    // SearchInput
    preTemplates!.push({
      key: "view_search_input",
      options: {
        entityId,
      },
    });

    // 디폴트 파라미터
    const def = this.getDefault(filterColumns);

    return {
      ...this.getTargetAndPath(names),
      body: `
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  Checkbox,
  Pagination,
  Segment,
  Table,
  TableRow,
  Message,
  Transition,
  Button,
  Label,
} from 'semantic-ui-react';
import classNames from 'classnames';
import { DateTime } from "luxon";
import { DelButton, EditButton, AppBreadcrumbs, AddButton, useSelection, useListParams, SonamuCol, numF, dateF, datetimeF } from '@sonamu-kit/react-sui';

import { ${names.capital}SubsetA } from "src/services/sonamu.generated";
import { ${names.capital}Service } from 'src/services/${names.fs}/${
        names.fs
      }.service';
import { ${names.capital}ListParams } from 'src/services/${names.fs}/${
        names.fs
      }.types';
${columnImports}
${filterColumns
  .map((col) => {
    return this.renderFilterImport(entityId, col, names);
  })
  .join("\n")}

type ${names.capital}ListProps = {};
export default function ${names.capital}List({}: ${names.capital}ListProps) {
  // 리스트 필터
  const { listParams, register } = useListParams(${names.capital}ListParams, {
    num: 12,
    page: 1,
    orderBy: '${def.orderBy}',
    search: '${def.search}',
  });

  // 리스트 쿼리
  const { data, mutate, error, isLoading } = ${names.capital}Service.use${
        names.capitalPlural
      }('A', listParams);
  const { rows, total } = data ?? {};

  // 삭제
  const confirmDel = (ids: number[]) => {
    const answer = confirm('삭제하시겠습니까?');
    if (!answer) {
      return;
    }

    ${names.capital}Service.del(ids).then(() => {
      mutate();
    });
  };

  // 일괄 삭제
  const confirmDelSelected = () => {
    const answer = confirm(\`\${selectedKeys.length}건을 일괄 삭제하시겠습니까?\`);
    if (!answer) {
      return;
    }

    ${names.capital}Service.del(selectedKeys).then(() => {
      mutate();
    });
  };

  // 현재 경로와 타이틀
  const PAGE = {
    route: '/admin/${names.fsPlural}',
    title: '${entity.title ?? names.capital}',
  };

  // 선택
  const {
    getSelected,
    isAllSelected,
    selectedKeys,
    toggle,
    selectAll,
    deselectAll,
  } = useSelection((rows ?? []).map((row) => row.id));

  // 컬럼
  const columns:SonamuCol<${names.capital}SubsetA>[] = [${columns
        .map((col) => {
          return [
            `{ label: "${col.label}",`,
            `tc: ${col.tc}, `,
            `collapsing: ${["Title", "Name"].includes(col.label) === false}, }`,
          ].join("\n");
        })
        .join(",\n")}];

  return (
    <div className="list ${names.fsPlural}-index">
      <div className="top-nav">
        <div className="header-row">
          <div className="header">{PAGE.title}</div>
          <AppBreadcrumbs>
            <Breadcrumb.Section active>{PAGE.title}</Breadcrumb.Section>
          </AppBreadcrumbs>
          <${names.capital}SearchInput
            input={register('keyword')}
            dropdown={register('search')}
          />
        </div>
        <div className="filters-row">
          ${filterColumns
            .map((col) => {
              return this.renderFilter(entityId, col, names);
            })
            .join("&nbsp;\n")}
        </div>
      </div>

      <Segment basic padded className="contents-segment" loading={isLoading}>
        <div className="buttons-row">
          <div className={classNames('count', { hidden: isLoading })}>
            {total} 건
          </div>
          <div className="buttons">
            <AddButton currentRoute={PAGE.route} icon="write" label="추가" />
          </div>
        </div>

        <Table
          celled
          compact
          selectable
          className={classNames({ hidden: total === undefined || total === 0 })}
        >
          <Table.Header>
            <TableRow>
              <Table.HeaderCell collapsing>
                <Checkbox
                  label="ID"
                  checked={isAllSelected}
                  onChange={isAllSelected ? deselectAll : selectAll}
                />
              </Table.HeaderCell>
              {
                /* Header */
                columns.map((col, index) => col.th ?? <Table.HeaderCell key={index} collapsing={col.collapsing}>{ col.label }</Table.HeaderCell>)
              }
              <Table.HeaderCell>관리</Table.HeaderCell>
            </TableRow>
          </Table.Header>
          <Table.Body>
            {rows &&
              rows.map((row, rowIndex) => (
                <Table.Row key={row.id}>
                  <Table.Cell>
                    <Checkbox
                      label={row.id}
                      checked={getSelected(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </Table.Cell>
                  {
                    /* Body */
                    columns.map((col, colIndex) => (
                      <Table.Cell key={colIndex} collapsing={col.collapsing} className={col.className}>
                        {col.tc(row, rowIndex)}
                      </Table.Cell>
                    ))
                  }
                  <Table.Cell collapsing>
                    <EditButton
                      as={Link}
                      to={\`\${PAGE.route}/form?id=\${row.id}\`}
                      state={{ from: PAGE.route }}
                    />
                    <DelButton onClick={() => confirmDel([row.id])} />
                  </Table.Cell>
                </Table.Row>
              ))}
          </Table.Body>
        </Table>
        <div
          className={classNames('pagination-row', {
            hidden: (total ?? 0) === 0,
          })}
        >
          <Pagination
            totalPages={Math.ceil((total ?? 0) / (listParams.num ?? 24))}
            {...register('page')}
          />
        </div>
      </Segment>

      <div className="fixed-menu">
        <Transition
          visible={selectedKeys.length > 0}
          animation="slide left"
          duration={500}
        >
          <Message size="small" color="violet" className="text-center">
            <span className="px-4">{selectedKeys.length}개 선택됨</span>
            <Button size="tiny" color="violet" onClick={() => deselectAll()}>
              선택 해제
            </Button>
            <Button size="tiny" color="red" onClick={confirmDelSelected}>
              일괄 삭제
            </Button>
          </Message>
        </Transition>
      </div>
    </div>
  );
}
      `.trim(),
      importKeys: [],
      preTemplates,
    };
  }
}

export function getEnumInfoFromColName(
  entityId: string,
  colName: string
): {
  id: string;
  targetEntityNames: EntityNamesRecord;
  targetEntityId: string;
  title: string;
} {
  const baseEntity = EntityManager.get(entityId);
  const prop = baseEntity.props.find((p) => p.name === colName);
  if (prop && isEnumProp(prop)) {
    return {
      id: prop.id,
      targetEntityId: entityId,
      targetEntityNames: EntityManager.getNamesFromId(entityId),
      title: prop.desc ?? prop.id,
    };
  } else {
    const idCandidate = camelize(
      underscore(entityId) + "_" + underscore(colName),
      false
    );
    try {
      const targetEntityNames = EntityManager.getNamesFromId(entityId);
      return {
        id: idCandidate,
        targetEntityId: entityId,
        targetEntityNames: targetEntityNames,
        title: idCandidate,
      };
    } catch {}
    throw new Error(`찾을 수 없는 EnumProp ${colName}`);
  }
}

export function getRelationPropFromColName(
  entityId: string,
  colName: string
): RelationProp {
  const baseEntity = EntityManager.get(entityId);
  const relProp = baseEntity.props.find((prop) => prop.name === colName);
  if (isRelationProp(relProp)) {
    const relEntity = EntityManager.get(relProp.with);
    if (relEntity.parentId !== undefined) {
      throw new Error("Only parent entities can be used as relation props");
    }
    return relProp;
  } else {
    throw new Error(`찾을 수 없는 Relation ${colName}`);
  }
}
