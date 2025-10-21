import React from "react";
import { Button, Form, Grid, Header, Segment, Message } from "semantic-ui-react";
import { UserLoginParams } from "src/services/user/user.types";
import { useAuth } from "src/admin-common/auth";
import { useNavigate, useLocation } from "react-router-dom";

export default function LoginTestPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const { login, logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = () => {
    setError("");
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해주세요");
      return;
    }

    login({ email, password });
  };

  const handleLogout = () => {
    logout();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <Grid
      textAlign="center"
      style={{ width: "98vw", height: "99vh" }}
      verticalAlign="middle"
    >
      <Grid.Column style={{ maxWidth: 450 }}>
        <Header as="h2" color="teal" textAlign="center">
          로그인 테스트
        </Header>
        <Form size="large">
          <Segment>
            {error && <Message error content={error} />}

            {user ? (
              <div>
                <Message success>
                  <Message.Header>로그인 성공</Message.Header>
                  <p>사용자: {user.username}</p>
                  <p>이메일: {user.email}</p>
                  <p>역할: {user.role}</p>
                </Message>
                <Button color="red" fluid size="large" onClick={handleLogout}>
                  로그아웃
                </Button>
                <Button
                  color="teal"
                  fluid
                  size="large"
                  style={{ marginTop: ".5em" }}
                  onClick={() => navigate("/admin")}
                >
                  관리자 페이지로 이동
                </Button>
              </div>
            ) : (
              <div>
                <Form.Input
                  fluid
                  icon="user"
                  iconPosition="left"
                  placeholder="이메일"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <Form.Input
                  fluid
                  icon="lock"
                  iconPosition="left"
                  placeholder="비밀번호"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                />

                <Button color="teal" fluid size="large" onClick={handleSubmit}>
                  로그인
                </Button>
              </div>
            )}
          </Segment>
        </Form>
      </Grid.Column>
    </Grid>
  );
}
