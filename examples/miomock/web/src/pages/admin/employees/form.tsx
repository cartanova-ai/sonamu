import { BackLink, formatDateTime, useGoBack, useTypeForm } from "@sonamu-kit/react-sui";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Form, Header, Input, Segment } from "semantic-ui-react";
import { useCommonModal } from "@/admin-common/CommonModal";
import { DepartmentIdAsyncSelect } from "@/components/department/DepartmentIdAsyncSelect";
import { UserIdAsyncSelect } from "@/components/user/UserIdAsyncSelect";
import { EmployeeService } from "@/services/employee/employee.service";
import { EmployeeSaveParams } from "@/services/employee/employee.types";
import type { EmployeeSubsetA } from "@/services/sonamu.generated";
import { defaultCatch } from "@/services/sonamu.shared";

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
  const [_row, setRow] = useState<EmployeeSubsetA | undefined>();

  // EmployeeSaveParams 폼
  const { form, setForm, register } = useTypeForm(EmployeeSaveParams, {
    user_id: 0,
    department_id: null,
    employee_number: "",
    salary: null,
    hire_date: null,
    notes: null,
  });

  // 수정일 때 기존 row 콜
  useEffect(() => {
    if (id) {
      EmployeeService.getEmployee("A", id).then((row) => {
        setRow(row);
        setForm({
          ...row,
          user_id: row.user.id,
          department_id: row.department?.id ?? null,
        });
      });
    }
  }, [id, setForm]);

  // CommonModal
  const { doneModal } = useCommonModal();

  // 저장
  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    EmployeeService.save([form])
      .then(([_id]) => {
        if (mode === "modal") {
          doneModal();
        } else {
          goBack("/admin/employees");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, goBack, doneModal]);

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
                <BackLink primary size="tiny" to="/admin/employees" content="목록" icon="list" />
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
                <label>USER</label>
                <UserIdAsyncSelect {...register("user_id")} subset="A" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>부서</label>
                <DepartmentIdAsyncSelect {...register("department_id")} clearable subset="A" />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>사번</label>
                <Input placeholder="사번" {...register(`employee_number`)} />
              </Form.Field>
            </Form.Group>
            <Form.Group widths="equal">
              <Form.Field>
                <label>SALARY</label>
                <Input placeholder="SALARY" {...register(`salary`)} />
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
