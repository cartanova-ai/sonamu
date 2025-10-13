import React from "react";
import { Button, Form, Grid, Header, Segment, Message } from "semantic-ui-react";
import { UserLoginParams } from "src/services/user/user.types";
import { useAuth } from "src/admin-common/auth";
import { useNavigate, useLocation } from "react-router-dom";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const { login, user } = useAuth();
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
          관리자 로그인
        </Header>
        <Form size="large">
          <Segment>
            {error && <Message error content={error} />}
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

            {user !== null && (
              <Button
                color="teal"
                style={{ marginTop: ".5em" }}
                onClick={() =>
                  navigate(
                    (location.state as any)?.from?.pathname ?? "/admin"
                  )
                }
              >
                {user.username}으로 로그인됨
              </Button>
            )}
          </Segment>
        </Form>
      </Grid.Column>
    </Grid>
  );
}
