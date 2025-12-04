import { BackLink, formatDateTime, useGoBack, useTypeForm } from "@sonamu-kit/react-sui";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Form, Header, Input, Segment } from "semantic-ui-react";
import { defaultCatch } from "../../../services/sonamu.shared";

// import { ImageUploader } from 'src/admin-common/ImageUploader';
// import { useCommonModal } from "../../../admin-common/CommonModal";

import { CompanyService } from "../../../services/company/company.service";
import { CompanySaveParams } from "../../../services/company/company.types";
import type { CompanySubsetA } from "../../../services/sonamu.generated";

export default function CompaniesFormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <CompaniesForm id={query?.id ? Number(query.id) : undefined} />;
}
type CompaniesFormProps = {
  id?: number;
  mode?: "page" | "modal";
};
export function CompaniesForm({ id, mode }: CompaniesFormProps) {
  // 편집시 기존 row
  const [_row, setRow] = useState<CompanySubsetA | undefined>();

  // CompanySaveParams 폼
  const { form, setForm, register } = useTypeForm(CompanySaveParams, {
    name: "",
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      CompanyService.getCompany("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
        });
      });
    }
  }, [id, setForm]);

  // CommonModal
  // const { doneModal, closeModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    CompanyService.save([form])
      .then(([_id]) => {
        if (mode === "modal") {
          // doneModal();
        } else {
          goBack("/admin/companies");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, goBack]);

  // 페이지
  const PAGE = {
    title: `COMPANY${id ? `#${id} 수정` : " 등록"}`,
  };

  return (
    <div className="form">
      <Segment padded basic>
        <Segment padded color="grey">
          <div className="header-row">
            <Header>{PAGE.title}</Header>
            {mode !== "modal" && (
              <div className="buttons">
                <BackLink primary size="tiny" to="/admin/companies" content="목록" icon="list" />
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
                <label>회사명</label>
                <Input placeholder="회사명" {...register(`name`)} />
              </Form.Field>
            </Form.Group>
            <Segment basic textAlign="center">
              <Button type="submit" primary onClick={handleSubmit} content="저장" icon="save" />
            </Segment>
          </Form>
        </Segment>
      </Segment>
    </div>
  );
}
