import {
  BackLink,
  BooleanToggle,
  formatDateTime,
  SQLDateInput,
  useGoBack,
  useTypeForm,
} from "@sonamu-kit/react-sui";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Form, Header, Input, Segment, TextArea } from "semantic-ui-react";
import { useCommonModal } from "@/admin-common/CommonModal";
import { UserRoleSelect } from "@/components/user/UserRoleSelect";
import { UserService } from "@/services/services.generated";
import type { UserSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";
import { UserSaveParams } from "@/services/user/user.types";

export default function UsersFormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <UsersForm id={query?.id ? Number(query.id) : undefined} />;
}
type UsersFormProps = {
  id?: number;
  mode?: "page" | "modal";
};
export function UsersForm({ id, mode }: UsersFormProps) {
  // 편집시 기존 row
  const [_row, setRow] = useState<UserSubsetA | undefined>();

  // UserSaveParams 폼
  const { form, setForm, register } = useTypeForm(UserSaveParams, {
    email: "",
    username: "",
    password: "",
    birth_date: null,
    role: "normal",
    last_login_at: null,
    bio: null,
    is_verified: false,
    deleted_at: null,
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      UserService.getUser("A", id).then((row) => {
        setRow(row);
        setForm({
          password: "", // 비밀번호는 수정이 아니라 새걸 입력하는 것으로!
          ...row,
        });
      });
    }
  }, [id, setForm]);

  const { doneModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    UserService.save([form])
      .then(([_id]) => {
        if (mode === "modal") {
          doneModal();
        } else {
          goBack("/admin/users");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, goBack, doneModal]);

  // 페이지
  const PAGE = {
    title: `USER${id ? `#${id} 수정` : " 등록"}`,
  };

  return (
    <div className="form">
      <Segment padded basic>
        <Segment padded color="grey">
          <div className="header-row">
            <Header>{PAGE.title}</Header>
            {mode !== "modal" && (
              <div className="buttons">
                <BackLink primary size="tiny" to="/admin/users" content="목록" icon="list" />
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
                <label>이메일</label>
                <Input placeholder="이메일" {...register(`email`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>이름</label>
                <Input placeholder="이름" {...register(`username`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>비밀번호</label>
                <Input placeholder="비밀번호" {...register(`password`)} type="password" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>생일</label>
                <SQLDateInput {...register(`birth_date`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>ROLE</label>
                <UserRoleSelect {...register(`role`)} textPrefix="" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>LASTLOGIN일시</label>
                <Input type="datetime-local" {...register(`last_login_at`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>BIO</label>
                <TextArea rows={8} placeholder="BIO" {...register(`bio`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>ISVERIFIED</label>
                <BooleanToggle {...register(`is_verified`)} />
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
