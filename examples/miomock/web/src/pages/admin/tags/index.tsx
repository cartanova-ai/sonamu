import { Icon, type IconProps } from "@iconify/react";
import { Button } from "@sonamu-kit/react-components/components";
import {
  AppBreadcrumbs,
  formatDateTime,
  type SonamuCol,
  useListParams,
  useSelection,
} from "@sonamu-kit/react-sui";
import classNames from "classnames";
import { useNavigate } from "react-router-dom";
import {
  Breadcrumb,
  Checkbox,
  Message,
  Pagination,
  Segment,
  Button as SUIButton,
  Table,
  TableRow,
  Transition,
} from "semantic-ui-react";

// Icons
const PlusIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:plus" {...props} />;
const EditIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:pencil" {...props} />;
const TrashIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:trash-2" {...props} />;

import { TagOrderBySelect } from "@/components/tag/TagOrderBySelect";
import { TagSearchInput } from "@/components/tag/TagSearchInput";
import { TagService } from "@/services/services.generated";
import type { TagSubsetA } from "@/services/sonamu.generated";
import { TagListParams } from "@/services/tag/tag.types";

type TagListProps = {};
export default function TagList({}: TagListProps) {
  const navigate = useNavigate();

  // 리스트 필터
  const { listParams, register } = useListParams(TagListParams, {
    num: 12,
    page: 1,
    orderBy: "id-desc",
    search: "id",
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = TagService.useTags("A", listParams);
  const { rows, total } = data ?? {};

  // 삭제
  const confirmDel = (ids: number[]) => {
    const answer = confirm("삭제하시겠습니까?");
    if (!answer) {
      return;
    }

    TagService.del(ids).then(() => {
      refetch();
    });
  };

  // 일괄 삭제
  const confirmDelSelected = () => {
    const answer = confirm(`${selectedKeys.length}건을 일괄 삭제하시겠습니까?`);
    if (!answer) {
      return;
    }

    TagService.del(selectedKeys).then(() => {
      refetch();
    });
  };

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/tags",
    title: "TAG",
  };

  // 선택
  const {
    getSelected,
    isAllSelected,
    selectedKeys,
    toggle,
    selectAll,
    deselectAll,
    handleCheckboxClick,
  } = useSelection((rows ?? []).map((row) => row.id));

  // 컬럼
  const columns: SonamuCol<TagSubsetA>[] = [
    {
      label: "등록일시",
      tc: (row) => <span className="text-tiny">{formatDateTime(row.created_at)}</span>,
      collapsing: true,
    },
    { label: "태그명", tc: (row) => <>{row.name}</>, collapsing: true },
  ];

  return (
    <div className="list tags-index">
      <div className="top-nav">
        <div className="header-row">
          <div className="header">{PAGE.title}</div>
          <AppBreadcrumbs>
            <Breadcrumb.Section active>{PAGE.title}</Breadcrumb.Section>
          </AppBreadcrumbs>
          <TagSearchInput input={register("keyword")} dropdown={register("search")} />
        </div>
        <div className="filters-row">
          &nbsp;
          <TagOrderBySelect {...register("orderBy")} />
        </div>
      </div>

      <Segment basic padded className="contents-segment" loading={isLoading}>
        <div className="buttons-row">
          <div className={classNames("count", { hidden: isLoading })}>{total} 건</div>
          <div className="buttons">
            <Button
              size="sm"
              onClick={() => navigate(`${PAGE.route}/form`, { state: { from: PAGE.route } })}
            >
              <PlusIcon />
              추가
            </Button>
          </div>
        </div>

        <Table
          celled
          compact
          selectable
          className={classNames({
            hidden: total === undefined || total === 0,
          })}
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
                columns.map(
                  (col, index) =>
                    col.th ?? (
                      <Table.HeaderCell key={index} collapsing={col.collapsing}>
                        {col.label}
                      </Table.HeaderCell>
                    ),
                )
              }
              <Table.HeaderCell>관리</Table.HeaderCell>
            </TableRow>
          </Table.Header>
          <Table.Body>
            {rows?.map((row, rowIndex) => (
              <Table.Row key={row.id}>
                <Table.Cell>
                  <Checkbox
                    label={row.id}
                    checked={getSelected(row.id)}
                    onChange={() => toggle(row.id)}
                    onClick={(e) => handleCheckboxClick(e, rowIndex)}
                  />
                </Table.Cell>
                {
                  /* Body */
                  columns.map((col, colIndex) => (
                    <Table.Cell
                      key={colIndex}
                      collapsing={col.collapsing}
                      className={col.className}
                    >
                      {col.tc(row, rowIndex)}
                    </Table.Cell>
                  ))
                }
                <Table.Cell collapsing>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(`${PAGE.route}/form?id=${row.id}`, { state: { from: PAGE.route } })
                    }
                  >
                    <EditIcon />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => confirmDel([row.id])}>
                    <TrashIcon />
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <div
          className={classNames("pagination-row", {
            hidden: (total ?? 0) === 0,
          })}
        >
          <Pagination
            totalPages={Math.ceil((total ?? 0) / (listParams.num ?? 24))}
            {...register("page")}
          />
        </div>
      </Segment>

      <div className="fixed-menu">
        <Transition visible={selectedKeys.length > 0} animation="slide left" duration={500}>
          <Message size="small" color="violet" className="text-center">
            <span className="px-4">{selectedKeys.length}개 선택됨</span>
            <SUIButton size="tiny" color="violet" onClick={() => deselectAll()}>
              선택 해제
            </SUIButton>
            <SUIButton size="tiny" color="red" onClick={confirmDelSelected}>
              일괄 삭제
            </SUIButton>
          </Message>
        </Transition>
      </div>
    </div>
  );
}
