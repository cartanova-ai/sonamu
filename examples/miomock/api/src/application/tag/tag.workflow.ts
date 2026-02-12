import { workflow } from "sonamu";

export const taxWorlflow = workflow({ name: "test-workflow" }, async ({ step, logger }) => {
  // 스크래핑
  await step
    .define({ name: "scrape-data" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      logger.info("Scraping completed");
    })
    .run();

  // 데이터 처리
  await step
    .define({ name: "process-data" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      logger.info("Processing completed");
    })
    .run();

  // 데이터 저장
  await step
    .define({ name: "save-data" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      logger.info("Saving completed");
    })
    .run();
});
