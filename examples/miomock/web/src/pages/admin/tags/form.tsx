import { Icon, type IconProps } from "@iconify/react";
import { Button } from "@sonamu-kit/react-components/components";
import { BackLink, formatDateTime, useGoBack, useTypeForm } from "@sonamu-kit/react-sui";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Form, Header, Input, Segment } from "semantic-ui-react";
import { useCommonModal } from "@/admin-common/CommonModal";

// Icons
const SaveIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:save" {...props} />;

import { TagService } from "@/services/services.generated";
import type { TagSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";
import { TagSaveParams } from "@/services/tag/tag.types";

export default function TagsFormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <TagsForm id={query?.id ? Number(query.id) : undefined} />;
}
type TagsFormProps = {
  id?: number;
  mode?: "page" | "modal";
};
export function TagsForm({ id, mode }: TagsFormProps) {
  // 편집시 기존 row
  const [_row, setRow] = useState<TagSubsetA | undefined>();

  // TagSaveParams 폼
  const { form, setForm, register } = useTypeForm(TagSaveParams, { name: "" });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      TagService.getTag("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
        });
      });
    }
  }, [id, setForm]);

  // CommonModal
  const { doneModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    TagService.save([form])
      .then(([_id]) => {
        if (mode === "modal") {
          doneModal();
        } else {
          goBack("/admin/tags");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, goBack, doneModal]);

  // 페이지
  const PAGE = {
    title: `TAG${id ? `#${id} 수정` : " 등록"}`,
  };

  return (
    <div className="form">
      <Segment padded basic>
        <Segment padded color="grey">
          <div className="header-row">
            <Header>{PAGE.title}</Header>
            {mode !== "modal" && (
              <div className="buttons">
                <BackLink primary size="tiny" to="/admin/tags" content="목록" icon="list" />
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
                <label>태그명</label>
                <Input placeholder="태그명" {...register(`name`)} />
              </Form.Field>
            </Form.Group>
            <Segment basic textAlign="center">
              <Button type="submit" onClick={handleSubmit}>
                <SaveIcon />
                저장
              </Button>
            </Segment>
          </Form>
        </Segment>
      </Segment>
    </div>
  );
}
