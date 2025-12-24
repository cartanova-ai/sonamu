import { Button } from "@sonamu-kit/react-components/components";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Form, Grid, Header, Message, Segment } from "semantic-ui-react";
import { useAuth } from "@/admin-common/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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
    <Grid textAlign="center" style={{ width: "98vw", height: "99vh" }} verticalAlign="middle">
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

            <Button className="w-full" size="lg" onClick={handleSubmit}>
              로그인
            </Button>

            {user !== null && (
              <Button
                className="mt-2"
                onClick={() =>
                  navigate(
                    (location.state as { from?: { pathname?: string } })?.from?.pathname ??
                      "/admin",
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
