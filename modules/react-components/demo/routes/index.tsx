import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">🎨 Sonamu React Components</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>📝 Form Components</CardTitle>
            <CardDescription>17개의 폼 입력 및 인터랙션 컴포넌트를 확인하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/form">
              <Button className="w-full">View Form Components</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🎨 Layout Components</CardTitle>
            <CardDescription>
              10개의 레이아웃 구조 및 컨테이너 컴포넌트를 확인하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/layout">
              <Button className="w-full">View Layout Components</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📊 Data Display Components</CardTitle>
            <CardDescription>11개의 데이터 표시 및 선택 컴포넌트를 확인하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/data-display">
              <Button className="w-full">View Data Display Components</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🔔 Dialogs & Alerts Components</CardTitle>
            <CardDescription>13개의 모달, 다이얼로그, 알림 컴포넌트를 확인하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/dialogs-alerts">
              <Button className="w-full">View Dialogs & Alerts</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🧭 Navigation Components</CardTitle>
            <CardDescription>6개의 네비게이션 및 메뉴 컴포넌트를 확인하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/navigation">
              <Button className="w-full">View Navigation Components</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="text-center text-sm text-muted-foreground max-w-2xl mx-auto">
        <p>
          이 컴포넌트들은 @sonamu-kit/react-components 패키지의 일부입니다.
          <br />
          모든 컴포넌트는 TypeScript로 작성되었으며, 완전한 타입 지원을 제공합니다.
        </p>
      </div>
    </div>
  );
}
