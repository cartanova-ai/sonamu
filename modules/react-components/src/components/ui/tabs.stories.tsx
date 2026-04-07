import { type Meta, type StoryObj } from "@storybook/react-vite";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-96">
      <TabsList>
        <TabsTrigger value="tab1">탭 1</TabsTrigger>
        <TabsTrigger value="tab2">탭 2</TabsTrigger>
        <TabsTrigger value="tab3">탭 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p className="text-sm text-muted-foreground p-4">첫 번째 탭의 내용입니다.</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p className="text-sm text-muted-foreground p-4">두 번째 탭의 내용입니다.</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p className="text-sm text-muted-foreground p-4">세 번째 탭의 내용입니다.</p>
      </TabsContent>
    </Tabs>
  ),
};
