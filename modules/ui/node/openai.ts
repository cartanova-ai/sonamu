import { readFileSync, writeFileSync } from "fs";
import OpenAI from "openai";
import { MessageListParams } from "openai/resources/beta/threads/messages";
import path from "path";
import { Sonamu } from "sonamu";

class OpenAIClass {
  private openai: OpenAI;
  private threadId: string;
  private assistantId: string;

  public isInit = false;

  async init() {
    if (this.isInit) {
      return;
    }
    if (Sonamu.secrets === null) {
      throw new Error("sonamu.secrets is not defined");
    }

    const { openai_api_key, openai_thread_id } = Sonamu.secrets;

    this.openai = new OpenAI({ apiKey: openai_api_key });
    if (!openai_thread_id) {
      this.threadId = await this.createThread();
      this.writeThreadId();
    } else {
      this.threadId = openai_thread_id;
    }
    this.isInit = true;

    // TODO: assistants list is paginated
    const assistants = (await this.openai.beta.assistants.list()).data;
    const myAsst = assistants.find(
      (a) =>
        a.metadata &&
        typeof a.metadata === "object" &&
        "target" in a.metadata &&
        a.metadata.target === "Sonamu"
    );

    if (!myAsst) {
      const instructionsPath = path.join(
        __dirname,
        "..",
        "openai.instructions.md"
      );
      const instructions = readFileSync(instructionsPath, "utf-8");
      this.assistantId = await this.createAssistant(instructions);
    } else {
      this.assistantId = myAsst.id;
    }

    console.log(
      `You can edit the instructions of the assistant at \x1b]8;;https://platform.openai.com/assistants/${this.assistantId}\x07https://platform.openai.com/assistants/${this.assistantId}\x1b]8;;\x07`
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
    const newThreadId = await this.createThread();
    this.threadId = newThreadId;
    this.writeThreadId();
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
    const messages = res.data.map((m) => ({
      id: m.id,
      content: m.content[0].type === "text" ? m.content[0].text.value : "",
    }));

    return messages;
  }

  async createMessage(content: string) {
    await this.openai.beta.threads.messages.create(this.threadId, {
      role: "user",
      content,
    });
  }

  getRunner() {
    const runner = this.openai.beta.threads.runs.stream(this.threadId, {
      assistant_id: this.assistantId,
    });
    return runner;
  }

  async runStatus() {
    return this.openai.beta.threads.runs.createAndPoll(
      this.threadId,
      {
        assistant_id: this.assistantId,
      },
      {
        pollIntervalMs: 100,
      }
    );
  }

  private async createAssistant(instructions: string | null) {
    const assistant = await this.openai.beta.assistants.create({
      name: "Sonamu",
      model: "gpt-4o-mini",
      instructions,
      metadata: {
        target: "Sonamu",
      },
    });

    return assistant.id;
  }

  private writeThreadId() {
    const configPath = path.join(Sonamu.apiRootPath, "sonamu.secrets.json");

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          ...Sonamu.secrets,
          openai_thread_id: this.threadId,
        },
        null,
        2
      )
    );
  }
}

export const openai = new OpenAIClass();
