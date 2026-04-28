import { type Meta, type StoryObj } from "@storybook/react-vite";

import Sidebar from "./Sidebar";

const meta = {
  component: Sidebar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { router: { pathname: "/admin" } },
};

export const AdminCompanies: Story = {
  parameters: { router: { pathname: "/admin/companies" } },
};
