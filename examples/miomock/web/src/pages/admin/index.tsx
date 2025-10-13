import React from "react";
import { useAuth } from "src/admin-common/auth";
import { Button, Container, Header, Segment } from "semantic-ui-react";
import { useNavigate } from "react-router-dom";

export default function AdminIndexPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  return (
    <Container style={{ marginTop: "2em" }}>
      <Header as="h1">관리자 대시보드</Header>

      <Segment>
        <Header as="h3">환영합니다!</Header>
        <p>
          <strong>이름:</strong> {user?.username}
        </p>
        <p>
          <strong>이메일:</strong> {user?.email}
        </p>
        <p>
          <strong>역할:</strong> {user?.role}
        </p>
        <p>
          <strong>가입일:</strong>{" "}
          {user?.created_at
            ? new Date(user.created_at).toLocaleDateString("ko-KR")
            : "-"}
        </p>

        <Button color="red" onClick={handleLogout}>
          로그아웃
        </Button>
      </Segment>

      <Segment>
        <Header as="h3">관리 메뉴</Header>
        <Button.Group vertical>
          <Button onClick={() => navigate("/admin/companies")}>
            회사 관리
          </Button>
          <Button onClick={() => navigate("/admin/users")}>사용자 관리</Button>
          <Button onClick={() => navigate("/admin/departments")}>
            부서 관리
          </Button>
          <Button onClick={() => navigate("/admin/employees")}>
            직원 관리
          </Button>
          <Button onClick={() => navigate("/admin/projects")}>
            프로젝트 관리
          </Button>
        </Button.Group>
      </Segment>
    </Container>
  );
}
