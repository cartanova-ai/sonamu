import { openai } from "@ai-sdk/openai";
import { type Agent, type ToolSet } from "ai";
import { dedent } from "radashi";
import { Naite } from "sonamu";
import { BaseAgentClass, tools } from "sonamu/ai";
import { z } from "zod";

import { ProjectSubsetP } from "../sonamu.generated";

type ProjectAgentContext = {};

const FetchProjectsInputSchema = z.object({
  num: z.number().int().nonnegative(),
  page: z.number().int().min(1),
});
type FetchProjectsInputSchema = z.infer<typeof FetchProjectsInputSchema>;

const FetchProjectsOutputSchema = z.object({
  projects: z.array(ProjectSubsetP),
  total: z.number().int().positive(),
});
type FetchProjectsOutputSchema = z.infer<typeof FetchProjectsOutputSchema>;

class ProjectAgentClass extends BaseAgentClass<ProjectAgentContext> {
  constructor() {
    super("ProjectAgent");
  }

  @tools({
    name: "fetchProjects",
    description: "Fetch projects from the database",
    schema: {
      input: FetchProjectsInputSchema,
      output: FetchProjectsOutputSchema,
    },
  })
  async fetchProjects(input: FetchProjectsInputSchema): Promise<FetchProjectsOutputSchema> {
    Naite.t("project.agent.fetchProjects", input);
    const { ProjectModel } = await import("./project.model");
    const { rows: projects, total } = await ProjectModel.findMany("P", {
      ...input,
      queryMode: "both",
    });

    return { projects, total: total ?? 0 };
  }

  public useAgent<T>(callback: (agent: Agent<never, ToolSet>) => Promise<T>): Promise<T> {
    return this.use(
      {
        model: openai.chat("gpt-4.1-mini"),
        instructions: dedent`
          You are a helpful assistant that can help with projects.
          You can use the following tools to help with projects:
          ${Object.entries(this.tools)
            .map(([name, tool]) => `- ${name}: ${tool.description}`)
            .join("\n")}
        `,
        toolChoice: "auto",
      },
      {},
      callback.bind(this),
    );
  }
}

export const ProjectAgent = new ProjectAgentClass();
