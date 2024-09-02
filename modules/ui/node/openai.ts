import { readFileSync, writeFileSync } from "fs";
import OpenAI from "openai";
import { MessageListParams } from "openai/resources/beta/threads/messages";
import path from "path";
import { Sonamu } from "sonamu";

type SonamuMetadata = {
  target: string;
};

class OpenAIClass {
  private openai: OpenAI;
  private threadId: string;
  private assistantId: string;
  public isInit = false;

  constructor() {
    if (!Sonamu.secrets || !Sonamu.secrets.openai_api_key) {
      return;
    }

    this.openai = new OpenAI({ apiKey: Sonamu.secrets.openai_api_key });
    this.threadId = Sonamu.secrets.openai_thread_id || "";
    this.assistantId = "";
  }

  async init() {
    if (this.isInit) return;

    if (!Sonamu.secrets || !Sonamu.secrets.openai_api_key) {
      throw new Error("OpenAI API key is not defined in Sonamu.secrets");
    }

    if (!Sonamu.secrets) {
      throw new Error("sonamu.secrets is not defined");
    }

    this.threadId = await this.getValidThreadId();
    this.assistantId = await this.getOrCreateAssistant();

    this.isInit = true;
    console.log(
      `Assistant instructions can be edited at: \x1b]8;;https://platform.openai.com/assistants/${this.assistantId}\x07https://platform.openai.com/assistants/${this.assistantId}\x1b]8;;\x07`
    );
  }

  async createThread() {
    const thread = await this.openai.beta.threads.create();
    return thread.id;
  }

  async deleteThread() {
    const { deleted } = await this.openai.beta.threads.del(this.threadId);
    return deleted;
  }

  async clearThread() {
    await this.deleteThread();
    this.threadId = await this.createThread();
    this.writeThreadId(this.threadId);
  }

  async getMessage(id: string) {
    const message = await this.openai.beta.threads.messages.retrieve(
      this.threadId,
      id
    );
    return {
      id: message.id,
      content:
        message.content[0].type === "text" ? message.content[0].text.value : "",
    };
  }

  async getMessages(query?: MessageListParams) {
    const res = await this.openai.beta.threads.messages.list(
      this.threadId,
      query
    );
    return res.data.map((m) => ({
      id: m.id,
      content: m.content[0].type === "text" ? m.content[0].text.value : "",
    }));
  }

  async createMessage(content: string) {
    await this.openai.beta.threads.messages.create(this.threadId, {
      role: "user",
      content,
    });
  }

  getRunner() {
    return this.openai.beta.threads.runs.stream(this.threadId, {
      assistant_id: this.assistantId,
    });
  }

  async runStatus() {
    return this.openai.beta.threads.runs.createAndPoll(
      this.threadId,
      { assistant_id: this.assistantId },
      { pollIntervalMs: 100 }
    );
  }

  private async getValidThreadId() {
    if (!this.threadId) {
      return this.createAndSaveNewThread();
    }

    try {
      await this.openai.beta.threads.retrieve(this.threadId);
      return this.threadId;
    } catch (e) {
      if (e.status === 404) {
        console.log("Thread not found. Creating a new thread...");
        return this.createAndSaveNewThread();
      }
      throw e;
    }
  }

  private async createAndSaveNewThread() {
    const newThreadId = await this.createThread();
    this.writeThreadId(newThreadId);
    return newThreadId;
  }

  private async getOrCreateAssistant() {
    const assistant = await this.findSonamuAssistant();
    if (assistant) return assistant.id;

    const instructionsPath = path.join(
      __dirname,
      "..",
      "openai.instructions.md"
    );
    const instructions = readFileSync(instructionsPath, "utf-8");
    return this.createAssistant(instructions);
  }

  private isSonamuMetadata(metadata: unknown): metadata is SonamuMetadata {
    return (
      metadata !== null &&
      typeof metadata === "object" &&
      "target" in metadata &&
      metadata.target === "Sonamu"
    );
  }

  private async findSonamuAssistant() {
    let page = await this.openai.beta.assistants.list();

    while (true) {
      const assistant = page.data.find((a) =>
        this.isSonamuMetadata(a.metadata)
      );
      if (assistant) return assistant;
      if (!page.hasNextPage()) break;
      page = await page.getNextPage();
    }

    return null;
  }

  private async createAssistant(instructions: string) {
    const assistant = await this.openai.beta.assistants.create({
      name: "Sonamu",
      model: "gpt-4o-mini",
      instructions,
      metadata: { target: "Sonamu" },
    });
    return assistant.id;
  }

  private writeThreadId(threadId: string) {
    const configPath = path.join(Sonamu.apiRootPath, "sonamu.secrets.json");
    const updatedSecrets = {
      ...Sonamu.secrets,
      openai_thread_id: threadId,
    };
    writeFileSync(configPath, JSON.stringify(updatedSecrets, null, 2));
  }
}

export const openai = new OpenAIClass();
