import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type ModelMessage, streamText } from "ai";
import { readFileSync } from "fs";
import path from "path";
import { Sonamu } from "sonamu";
import { inspect } from "util";

class AIClient {
  private llm: ReturnType<typeof createAnthropic> | null = null;
  private instructions: string = "";
  private messages: ModelMessage[] = [];
  public isInit = false;

  constructor() {
    if (!Sonamu.secrets || !Sonamu.secrets.openai_api_key) {
      return;
    }

    this.llm = createAnthropic({
      apiKey: Sonamu.secrets.openai_api_key,
    });
  }

  async init() {
    if (this.isInit) return;

    if (!Sonamu.secrets || !Sonamu.secrets.openai_api_key) {
      throw new Error("OpenAI API key is not defined in Sonamu.secrets");
    }

    if (!this.llm) {
      this.llm = createAnthropic({
        apiKey: Sonamu.secrets.openai_api_key,
      });
    }

    const instructionsPath = path.join(import.meta.dirname, "..", "openai.instructions.md");
    this.instructions = readFileSync(instructionsPath, "utf-8");

    this.isInit = true;
    console.log("OpenAI client initialized with AI SDK");
  }

  clearMessages() {
    this.messages = [];
  }

  getMessages() {
    return this.messages.map((m, idx) => ({
      id: `msg_${idx}`,
      content: typeof m.content === "string" ? m.content : "",
    }));
  }

  addMessage(content: string) {
    this.messages.push({
      role: "user",
      content,
    });
  }

  async generate(content: string) {
    if (!this.llm) {
      throw new Error("OpenAI client is not initialized");
    }

    this.addMessage(content);

    const res = await generateText({
      model: this.llm("claude-sonnet-4-5"),
      system: this.instructions,
      messages: this.messages,
    });

    console.log(inspect(res, false, null, true));

    this.messages.push({
      role: "assistant",
      content: res.text,
    });

    console.log("generated message");

    return res.text;
  }

  getStreamRunner(content: string): {
    textStream: AsyncIterable<string>;
  } {
    if (!this.llm) {
      throw new Error("OpenAI client is not initialized");
    }

    this.addMessage(content);

    const result = streamText({
      model: this.llm("claude-sonnet-4-5"),
      system: this.instructions,
      messages: this.messages,
      onFinish: ({ text }) => {
        this.messages.push({
          role: "assistant",
          content: text,
        });
      },
    });

    return {
      textStream: result.textStream,
    };
  }
}

export const aiClient = new AIClient();
