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

import { EmployeeSaveParams } from "src/services/employee/employee.types";
import { EmployeeService } from "src/services/employee/employee.service";
import { EmployeeSubsetA } from "src/services/sonamu.generated";
import { UserIdAsyncSelect } from "src/components/user/UserIdAsyncSelect";
import { DepartmentIdAsyncSelect } from "../../../components/department/DepartmentIdAsyncSelect";

export default function EmployeesFormPage() {
  // 라우팅 searchParams
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <EmployeesForm id={query?.id ? Number(query.id) : undefined} />;
}
type EmployeesFormProps = {
  id?: number;
  mode?: "page" | "modal";
};
export function EmployeesForm({ id, mode }: EmployeesFormProps) {
  // 편집시 기존 row
  const [row, setRow] = useState<EmployeeSubsetA | undefined>();

  // EmployeeSaveParams 폼
  const { form, setForm, register } = useTypeForm(EmployeeSaveParams, {
    user_id: 0,
    department_id: null,
    employee_number: "",
    salary: null,
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      EmployeeService.getEmployee("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
          user_id: row.user?.id ?? null,
          department_id: row.department?.id ?? null,
        });
      });
    }
  }, [id]);

  // CommonModal
  // const { doneModal, closeModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    EmployeeService.save([form])
      .then(([id]) => {
        if (mode === "modal") {
          // doneModal();
        } else {
          goBack("/admin/employees");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, id]);

  // 페이지
  const PAGE = {
    title: `직원${id ? `#${id} 수정` : " 등록"}`,
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
                  to="/admin/employees"
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
                <label>직원번호</label>
                <Input
                  placeholder="직원번호"
                  {...register(`employee_number`)}
                />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>사용자</label>
                <UserIdAsyncSelect {...register("user_id")} subset="A" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>부서</label>
                <DepartmentIdAsyncSelect
                  {...register("department_id")}
                  subset="A"
                />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>급여</label>
                <Input placeholder="급여" {...register(`salary`)} />
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
