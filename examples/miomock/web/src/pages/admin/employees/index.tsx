import React from "react";
import { Link } from "react-router-dom";
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
} from "semantic-ui-react";
import classNames from "classnames";
import { DateTime } from "luxon";
import {
  DelButton,
  EditButton,
  AppBreadcrumbs,
  AddButton,
  useSelection,
  useListParams,
  SonamuCol,
  numF,
  formatDate,
  formatDateTime,
} from "@sonamu-kit/react-sui";

import { EmployeeSubsetA } from "src/services/sonamu.generated";
import { EmployeeService } from "src/services/employee/employee.service";
import { EmployeeListParams } from "src/services/employee/employee.types";

import { EmployeeSearchInput } from "src/components/employee/EmployeeSearchInput";
import { EmployeeOrderBySelect } from "src/components/employee/EmployeeOrderBySelect";

type EmployeeListProps = {};
export default function EmployeeList({}: EmployeeListProps) {
  // 리스트 필터
  const { listParams, register } = useListParams(EmployeeListParams, {
    num: 12,
    page: 1,
    orderBy: "id-desc",
    search: "id",
  });

  // 리스트 쿼리
  const { data, mutate, error, isLoading } = EmployeeService.useEmployees(
    "A",
    listParams,
  );
  const { rows, total } = data ?? {};

  // 삭제
  const confirmDel = (ids: number[]) => {
    const answer = confirm("삭제하시겠습니까?");
    if (!answer) {
      return;
    }

    EmployeeService.del(ids).then(() => {
      mutate();
    });
  };

  // 일괄 삭제
  const confirmDelSelected = () => {
    const answer = confirm(`${selectedKeys.length}건을 일괄 삭제하시겠습니까?`);
    if (!answer) {
      return;
    }

    EmployeeService.del(selectedKeys).then(() => {
      mutate();
    });
  };

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/employees",
    title: "직원",
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
  const columns: SonamuCol<EmployeeSubsetA>[] = [
    {
      label: "등록일시",
      tc: (row) => (
        <span className="text-tiny">{formatDateTime(row.created_at)}</span>
      ),
      collapsing: true,
    },
    {
      label: "사번",
      tc: (row) => <>{row.employee_number}</>,
      collapsing: true,
    },
    { label: "SALARY", tc: (row) => <>{row.salary}</>, collapsing: true },
    {
      label: "USER",
      tc: (row) => <>{/* object row.user */}</>,
      collapsing: true,
    },
    {
      label: "부서",
      tc: (row) => <>{row.department?.name}</>,
      collapsing: true,
    },
  ];

  return (
    <div className="list employees-index">
      <div className="top-nav">
        <div className="header-row">
          <div className="header">{PAGE.title}</div>
          <AppBreadcrumbs>
            <Breadcrumb.Section active>{PAGE.title}</Breadcrumb.Section>
          </AppBreadcrumbs>
          <EmployeeSearchInput
            input={register("keyword")}
            dropdown={register("search")}
          />
        </div>
        <div className="filters-row">
          &nbsp;
          <EmployeeOrderBySelect {...register("orderBy")} />
        </div>
      </div>

      <Segment basic padded className="contents-segment" loading={isLoading}>
        <div className="buttons-row">
          <div className={classNames("count", { hidden: isLoading })}>
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
            {rows &&
              rows.map((row, rowIndex) => (
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
                    <EditButton
                      as={Link}
                      to={`${PAGE.route}/form?id=${row.id}`}
                      state={{ from: PAGE.route }}
                    />
                    <DelButton onClick={() => confirmDel([row.id])} />
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
