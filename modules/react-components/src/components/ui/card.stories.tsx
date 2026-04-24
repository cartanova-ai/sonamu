import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>카르타노바 디자인 시스템</CardTitle>
        <CardDescription>sonamu-kit 에 포함된 공용 컴포넌트 모음</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          버튼, 입력, 다이얼로그 등 웹 서비스에 필요한 기본 primitive 를 한 곳에 모아둡니다.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>새 AST 결과 검토 요청</CardTitle>
        <CardDescription>두 건의 AST 결과가 사용자 검토를 기다리고 있습니다.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            더보기
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">확인 후 승인하거나 반려 사유를 남겨 주세요.</p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline">취소</Button>
        <Button>확인</Button>
      </CardFooter>
    </Card>
  ),
};
