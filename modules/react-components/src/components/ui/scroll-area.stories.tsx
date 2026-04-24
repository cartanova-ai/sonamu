import { type Meta, type StoryObj } from "@storybook/react-vite";

import { ScrollArea } from "./scroll-area";

const meta = {
  component: ScrollArea,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    return (
      <div className="w-80">
        <ScrollArea className="h-[200px] border rounded p-4">
          <div className="space-y-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i}>아이템 {i + 1}</div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  },
};

export const LongText: Story = {
  render: function Render() {
    return (
      <div className="w-80">
        <ScrollArea className="h-[200px] border rounded p-4">
          <p className="text-sm leading-6">
            소나무는 한국의 대표적인 침엽수로, 상록성 교목에 속합니다. 줄기는 곧게 자라며 수피는
            적갈색을 띠고 거북등 무늬처럼 갈라집니다. 잎은 바늘 모양으로 두 개씩 한 다발을 이루어
            짧은 가지에 붙으며, 길이는 8에서 14센티미터 정도입니다. 꽃은 5월에 피며 같은 나무에
            암꽃과 수꽃이 따로 달리는 단성화입니다. 열매인 솔방울은 다음 해 가을에 성숙하며, 씨앗은
            날개를 달고 있어 바람을 타고 멀리 날아갑니다. 소나무는 척박한 땅에서도 잘 자라기 때문에
            한반도 전역에 널리 분포하며, 예로부터 목재와 송진을 제공하는 유용한 수종으로 이용되어
            왔습니다. 또한 사계절 푸른 잎을 유지하는 특성 때문에 지조와 절개의 상징으로 여겨져 많은
            예술 작품의 소재가 되기도 했습니다. 현대에는 조경수로도 널리 심어지며, 소나무 숲은
            피톤치드를 많이 방출해 휴양림의 주요 수종으로 자리잡고 있습니다.
          </p>
        </ScrollArea>
      </div>
    );
  },
};
