import React, {
  useEffect,
  useState,
  Dispatch,
  SetStateAction,
  forwardRef,
  Ref,
  useImperativeHandle,
  useCallback,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Checkbox,
  Form,
  Header,
  Input,
  Segment,
  TextArea,
  Label,
} from "semantic-ui-react";
import { DateTime } from "luxon";

import {
  BackLink,
  LinkInput,
  NumberInput,
  BooleanToggle,
  SQLDateTimeInput,
  SQLDateInput,
  useTypeForm,
  useGoBack,
  formatDateTime,
} from "@sonamu-kit/react-sui";
import { defaultCatch } from "src/services/sonamu.shared";
// import { ImageUploader } from 'src/admin-common/ImageUploader';
// import { useCommonModal } from "src/admin-common/CommonModal";

import { FileSaveParams } from "src/services/file/file.types";
import { FileService } from "src/services/file/file.service";
import { FileSubsetA } from "src/services/sonamu.generated";

export default function FilesFormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <FilesForm id={query?.id ? Number(query.id) : undefined} />;
}
type FilesFormProps = {
  id?: number;
  mode?: "page" | "modal";
};
export function FilesForm({ id, mode }: FilesFormProps) {
  // 편집시 기존 row
  const [row, setRow] = useState<FileSubsetA | undefined>();

  // FileSaveParams 폼
  const { form, setForm, register } = useTypeForm(FileSaveParams, {
    mime_type: "",
    name: "",
    url: "",
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      FileService.getFile("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
        });
      });
    }
  }, [id]);

  // CommonModal
  // const { doneModal, closeModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    FileService.save([form])
      .then(([id]) => {
        if (mode === "modal") {
          // doneModal();
        } else {
          goBack("/admin/files");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, id]);

  // 페이지
  const PAGE = {
    title: `FILE${id ? `#${id} 수정` : " 등록"}`,
  };

  return (
    <div className="form">
      <Segment padded basic>
        <Segment padded color="grey">
          <div className="header-row">
            <Header>{PAGE.title}</Header>
            {mode !== "modal" && (
              <div className="buttons">
                <BackLink
                  primary
                  size="tiny"
                  to="/admin/files"
                  content="목록"
                  icon="list"
                />
              </div>
            )}
          </div>
          <Form>
            {form.id && (
              <Form.Group widths="equal">
                <Form.Field>
                  <label>등록일시</label>
                  <div className="p-8px">{formatDateTime(form.created_at)}</div>
                </Form.Field>
              </Form.Group>
            )}
            <Form.Group widths="equal">
              <Form.Field>
                <label>MIME타입</label>
                <Input placeholder="MIME타입" {...register(`mime_type`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>FILE명</label>
                <Input placeholder="FILE명" {...register(`name`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>URL</label>
                <Input placeholder="URL" {...register(`url`)} />
              </Form.Field>
            </Form.Group>
            <Segment basic textAlign="center">
              <Button
                type="submit"
                primary
                onClick={handleSubmit}
                content="저장"
                icon="save"
              />
            </Segment>
          </Form>
        </Segment>
      </Segment>
    </div>
  );
}
