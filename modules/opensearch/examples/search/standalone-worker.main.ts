import { runStandaloneWorker } from "./standalone-worker";

const fields = (message: string, values: Record<string, string | number>) =>
  JSON.stringify({ message, ...values });

await runStandaloneWorker(
  {
    info: (message, values) => console.info(fields(message, values)),
    warn: (message, values) => console.warn(fields(message, values)),
    error: (message, values) => console.error(fields(message, values)),
  },
  { increment: () => {}, gauge: () => {} },
);
