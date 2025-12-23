import {
  AddButton,
  AppBreadcrumbs,
  DelButton,
  EditButton,
  formatDateTime,
  type SonamuCol,
  upload,
  useListParams,
  useSelection,
  useTypeForm,
} from "@sonamu-kit/react-sui";
import classNames from "classnames";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  Button,
  Checkbox,
  Form,
  Label,
  Message,
  Pagination,
  Segment,
  Table,
  TableRow,
  Transition,
} from "semantic-ui-react";
import z from "zod";
import { ApiLogViewer } from "@/admin-common/ApiLogViewer";
import { ImageUploader } from "@/admin-common/ImageUploader";
import { FileOrderBySelect } from "@/components/file/FileOrderBySelect";
import { FileSearchInput } from "@/components/file/FileSearchInput";
import { FileListParams, FileSaveParams } from "@/services/file/file.types";
import { FileService } from "@/services/services.generated";
import type { FileSubsetA } from "@/services/sonamu.generated";

type FileListProps = {};
export default function FileList({}: FileListProps) {
  // Eager 모드 테스트 상태
  const eagerForm = useTypeForm(FileSaveParams, {
    name: "",
    url: "",
    mime_type: "",
  });
  const eagerMultipleForm = useTypeForm(
    z.object({
      urls: z.array(z.string()),
    }),
    {
      urls: [],
    },
  );

  // Lazy 모드 테스트 상태
  const lazyForm = useTypeForm(
    z.object({
      url: z.string(),
    }),
    {
      url: "",
    },
  );
  const lazyMultipleForm = useTypeForm(
    z.object({
      urls: z.array(z.string()),
    }),
    {
      urls: [],
    },
  );

  const [uploading, setUploading] = useState(false);
  // 리스트 필터
  const { listParams, register } = useListParams(FileListParams, {
    num: 12,
    page: 1,
    orderBy: "id-desc",
    search: "id",
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = FileService.useFiles("A", listParams);
  const { rows, total } = data ?? {};

  // 삭제
  const confirmDel = (ids: number[]) => {
    const answer = confirm("삭제하시겠습니까?");
    if (!answer) {
      return;
    }

    FileService.del(ids).then(() => {
      refetch();
    });
  };

  // 일괄 삭제
  const confirmDelSelected = () => {
    const answer = confirm(`${selectedKeys.length}건을 일괄 삭제하시겠습니까?`);
    if (!answer) {
      return;
    }

    FileService.del(selectedKeys).then(() => {
      refetch();
    });
  };

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/files",
    title: "FILE",
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
  const columns: SonamuCol<FileSubsetA>[] = [
    {
      label: "등록일시",
      tc: (row) => <span className="text-tiny">{formatDateTime(row.created_at)}</span>,
      collapsing: true,
    },
    { label: "MIME타입", tc: (row) => <>{row.mime_type}</>, collapsing: true },
    { label: "FILE명", tc: (row) => <>{row.name}</>, collapsing: true },
    { label: "URL", tc: (row) => <>{row.url}</>, collapsing: true },
  ];

  return (
    <div className="list files-index">
      <div className="top-nav">
        <div className="header-row">
          <div className="header">{PAGE.title}</div>
          <AppBreadcrumbs>
            <Breadcrumb.Section active>{PAGE.title}</Breadcrumb.Section>
          </AppBreadcrumbs>
          <FileSearchInput input={register("keyword")} dropdown={register("search")} />
        </div>
        <div className="filters-row">
          &nbsp;
          <FileOrderBySelect {...register("orderBy")} />
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <Segment color="blue">
            <Label attached="top" color="blue">
              Eager 모드 테스트 (기존 방식)
            </Label>
            <Form>
              <Form.Group>
                <Form.Field width={16}>
                  <label>파일 업로드 (즉시 업로드)</label>
                  <ImageUploader multiple={false} {...eagerForm.register("url")} />
                </Form.Field>
              </Form.Group>
            </Form>
          </Segment>

          <Segment color="blue">
            <Label attached="top" color="blue">
              Eager 모드 테스트 (Multiple)
            </Label>
            <Form>
              <Form.Group>
                <Form.Field width={16}>
                  <label>파일 업로드 (즉시 업로드)</label>
                  <ImageUploader multiple={true} {...eagerMultipleForm.register("urls")} />
                </Form.Field>
              </Form.Group>
            </Form>
          </Segment>

          <Segment color="green">
            <Label attached="top" color="green">
              Lazy 모드 테스트 (submit 시점에 업로드)
            </Label>
            <Form>
              <Form.Group>
                <Form.Field width={16}>
                  <label>파일 선택 (업로드 대기)</label>
                  <ImageUploader mode="lazy" multiple={false} {...lazyForm.register("url")} />
                </Form.Field>
              </Form.Group>
              <Form.Group>
                <Form.Field width={16}>
                  <Button
                    color="green"
                    onClick={async () => {
                      setUploading(true);
                      try {
                        const _urls = await upload();
                        refetch();
                      } finally {
                        setUploading(false);
                      }
                    }}
                    loading={uploading}
                  >
                    저장 (클릭 시 업로드 시작)
                  </Button>
                  <span style={{ marginLeft: "1em" }}>
                    {lazyForm.form.url ? lazyForm.form.url : "파일 대기 중"}
                  </span>
                </Form.Field>
              </Form.Group>
            </Form>
          </Segment>

          <Segment color="olive">
            <Label attached="top" color="olive">
              Lazy 모드 테스트 (Multiple)
            </Label>
            <Form>
              <Form.Group>
                <Form.Field width={16}>
                  <label>파일 선택 (업로드 대기)</label>
                  <ImageUploader
                    mode="lazy"
                    accept="image/*"
                    preview={false}
                    multiple={true}
                    {...lazyMultipleForm.register("urls")}
                  />
                </Form.Field>
              </Form.Group>
              <Form.Group>
                <Form.Field width={16}>
                  <Button
                    color="green"
                    onClick={async () => {
                      setUploading(true);
                      try {
                        const _urls = await upload();
                        refetch();
                      } finally {
                        setUploading(false);
                      }
                    }}
                    loading={uploading}
                  >
                    저장 (클릭 시 업로드 시작)
                  </Button>
                  <span style={{ marginLeft: "1em" }}>
                    {`${lazyMultipleForm.form.urls.length}개의 파일 대기 중`}
                  </span>
                </Form.Field>
              </Form.Group>
            </Form>
          </Segment>
        </div>

        <div style={{ flex: 1 }}>
          <ApiLogViewer bodyOnly={true} />
        </div>
      </div>

      <Segment basic padded className="contents-segment" loading={isLoading}>
        <div className="buttons-row">
          <div className={classNames("count", { hidden: isLoading })}>{total} 건</div>
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
        <Transition visible={selectedKeys.length > 0} animation="slide left" duration={500}>
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
