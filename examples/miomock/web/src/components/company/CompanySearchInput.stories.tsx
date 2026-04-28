import { type Meta, type StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { CompanySearchInput } from "./CompanySearchInput";

const meta = {
  component: CompanySearchInput,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof CompanySearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    input: {
      value: "",
      onValueChange: () => {},
    },
    dropdown: {
      value: "name",
      onValueChange: () => {},
    },
  },
};

export const Controlled: Story = {
  render: function Render() {
    const [keyword, setKeyword] = useState<string | undefined>("카르타노바");
    const [field, setField] = useState<string | undefined>("name");

    return (
      <div className="flex flex-col gap-2">
        <CompanySearchInput
          input={{
            value: keyword,
            onValueChange: (value) => setKeyword(value ?? ""),
          }}
          dropdown={{
            value: field,
            onValueChange: (value) => setField(value ?? "name"),
          }}
        />
        <div className="text-xs text-muted-foreground">
          검색어: <span className="font-mono">{keyword || "(비어 있음)"}</span> · 필드:{" "}
          <span className="font-mono">{field}</span>
        </div>
      </div>
    );
  },
};
