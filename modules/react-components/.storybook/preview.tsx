import type { Preview } from "@storybook/react-vite";
import { Agentation } from "agentation";
import { SonamuProvider } from "@/contexts";
import "../src/styles/globals.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <SonamuProvider>
        <Story />
        <Agentation endpoint="http://localhost:4747" />
      </SonamuProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
