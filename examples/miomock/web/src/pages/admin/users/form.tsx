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
} from "@sonamu-kit/react-sui";
import { defaultCatch } from "src/services/sonamu.shared";
// import { ImageUploader } from 'src/admin-common/ImageUploader';
// import { useCommonModal } from "src/admin-common/CommonModal";

import { UserSaveParams } from "src/services/user/user.types";
import { UserService } from "src/services/user/user.service";
import { UserSubsetA } from "src/services/sonamu.generated";
import { UserRoleSelect } from "src/components/user/UserRoleSelect";

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
  const [row, setRow] = useState<UserSubsetA | undefined>();

  // UserSaveParams 폼
  const { form, setForm, register } = useTypeForm(UserSaveParams, {
    email: "",
    username: "",
    birth_date: null,
    role: "normal",
    last_login_at: null,
    bio: null,
    is_verified: false,
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      UserService.getUser("A", id).then((row) => {
        setRow(row);
        setForm({
          ...form,
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
    UserService.save([form])
      .then(([id]) => {
        if (mode === "modal") {
          // doneModal();
        } else {
          goBack("/admin/users");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, id]);

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
                <BackLink
                  primary
                  size="tiny"
                  to="/admin/users"
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
                  <div className="p-8px">{form.created_at}</div>
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
                <SQLDateTimeInput {...register(`last_login_at`)} />
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
