import { zodResolver } from "@hookform/resolvers/zod";
import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "./button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form";
import { Input } from "./input";

const formSchema = z.object({
  username: z.string().min(2, "이름은 2자 이상이어야 합니다"),
  email: z.string().email("올바른 이메일을 입력하세요"),
});

// Form은 react-hook-form의 useForm 결과(14개 메서드 + children)를 모두 required로 받기 때문에
// meta.component를 Form으로 직접 두면 StoryObj가 args를 강제합니다. useForm은 훅이라
// 모듈 top-level에서 호출이 불가능하므로, 데모용 컨테이너 컴포넌트를 만들어 그 위에 stories를 정의합니다.
function FormDemo() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", email: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} className="w-80 space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl>
                <Input placeholder="홍길동" {...field} />
              </FormControl>
              <FormDescription>표시될 이름입니다.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input placeholder="email@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">제출</Button>
      </form>
    </Form>
  );
}

const meta = {
  component: FormDemo,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof FormDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
