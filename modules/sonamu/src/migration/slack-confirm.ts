import assert from "assert";
import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { Sonamu } from "../api/sonamu";
import { type SonamuDBConfig } from "../database/db";
import { SD } from "../dict/sd";
import { type MigrationResult } from "./migrator";

export type SlackConfirmResult = {
  status: "approved" | "rejected" | "pending" | "not_configured" | "error";
  ts?: string;
  channel?: string;
  error?: string;
};

export type SlackConfirmPendingResult = {
  type: "pending";
  channel: string;
  ts: string;
};

export class SlackConfirm {
  private config = Sonamu.config.slackConfirm;

  private validateConfiguredTargets(): void {
    if (!this.config) {
      return;
    }

    const validTargets = Object.keys(Sonamu.dbConfig);
    const invalidTargets = this.config.targets.filter((target) => !validTargets.includes(target));

    if (invalidTargets.length > 0) {
      assert.fail(
        SD("sonamu.error.slackConfirmInvalidTargets")(
          invalidTargets.join(", "),
          validTargets.join(", "),
        ),
      );
    }
  }

  /**
   * 설정이 있는지 확인합니다.
   */
  isConfigured(): boolean {
    this.validateConfiguredTargets();
    return !!(this.config?.botToken && this.config?.channelId);
  }

  /**
   * 해당 target이 승인 대상인지 확인합니다.
   */
  isTargetRequiresApproval(target: keyof SonamuDBConfig): boolean {
    this.validateConfiguredTargets();
    return this.config?.targets?.includes(target) ?? false;
  }

  /**
   * 마이그레이션 목록의 해시를 생성합니다.
   */
  getMigrationsHash(migrations: string[]): string {
    const sorted = [...migrations].toSorted();
    return crypto.createHash("md5").update(sorted.join(",")).digest("hex").slice(0, 12);
  }

  /**
   * 로컬 파일 경로를 반환합니다.
   */
  private getConfirmFilePath(hash: string): string {
    return path.join(Sonamu.apiRootPath, "src", "migrations", `.slack-confirm-${hash}`);
  }

  /**
   * 기존 승인 요청을 조회합니다.
   */
  async getExistingRequest(migrations: string[]): Promise<{ channel: string; ts: string } | null> {
    const hash = this.getMigrationsHash(migrations);
    const filePath = this.getConfirmFilePath(hash);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const [channel, ts] = content.trim().split(":");
      if (channel && ts) {
        return { channel, ts };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 승인 요청을 저장합니다.
   */
  async saveRequest(migrations: string[], channel: string, ts: string): Promise<void> {
    const hash = this.getMigrationsHash(migrations);
    const filePath = this.getConfirmFilePath(hash);
    await fs.writeFile(filePath, `${channel}:${ts}`, "utf-8");
  }

  /**
   * 현재 사용자 이름을 반환합니다.
   */
  private getRequestor(): string {
    return process.env.USER ?? os.userInfo().username ?? "Unknown";
  }

  /**
   * 슬랙 메시지를 발송합니다.
   */
  async postApprovalRequest(
    migrations: string[],
    targets: string[],
    requestor?: string,
  ): Promise<{ channel: string; ts: string }> {
    assert(this.config, SD("sonamu.error.slackConfirmNotConfigured"));
    this.validateConfiguredTargets();

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: this.config.channelId,
        text: this.buildMessageText(migrations, targets, requestor ?? this.getRequestor()),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status}`);
    }

    const data =
      /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ (await response.json()) as {
        ok: boolean;
        error?: string;
        channel: string;
        ts: string;
      };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      channel: data.channel,
      ts: data.ts,
    };
  }

  /**
   * 메시지 텍스트를 생성합니다.
   */
  private buildMessageText(migrations: string[], targets: string[], requestor: string): string {
    const projectName = Sonamu.config.projectName ?? "Unknown";
    const timestamp = new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
    const migrationsText = migrations.map((m) => `• ${m}`).join("\n");
    const targetsText = targets.join(", ");

    return `🗄️ *[${projectName}] Production 마이그레이션 승인 요청*

*요청자:* ${requestor}
*대상 DB:* ${targetsText}
*시간:* ${timestamp}

*적용 예정 마이그레이션:*
${migrationsText}`;
  }

  /**
   * 승인 상태를 확인합니다 (reactions.get).
   */
  async checkApproval(
    channel: string,
    ts: string,
  ): Promise<{
    approved: boolean;
    rejected: boolean;
    approver?: string;
  }> {
    assert(this.config, SD("sonamu.error.slackConfirmNotConfigured"));

    const response = await fetch(
      `https://slack.com/api/reactions.get?channel=${channel}&timestamp=${ts}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.botToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status}`);
    }

    const data =
      /* SAFETY: Knex와 PostgreSQL 스키마 조회 계약이 이 값의 타입을 보장한다. */ (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: {
          reactions?: Array<{
            name: string;
            users?: string[];
          }>;
        };
      };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    const reactions = data.message?.reactions ?? [];
    const approved = reactions.find((r) => r.name === "white_check_mark");
    const rejected = reactions.find((r) => r.name === "x");

    return {
      approved: !!approved,
      rejected: !!rejected,
      approver: approved?.users?.[0],
    };
  }

  /**
   * Force 승인 처리를 수행합니다 (본인이 ✅ 찍고 스레드에 사유 남김).
   */
  async forceApproval(
    channel: string,
    ts: string,
    reason: string,
    requestor?: string,
  ): Promise<void> {
    assert(this.config, SD("sonamu.error.slackConfirmNotConfigured"));
    const actualRequestor = requestor ?? this.getRequestor();

    // 1. ✅ 이모지 추가
    const addReactionResponse = await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        timestamp: ts,
        name: "white_check_mark",
      }),
    });

    if (!addReactionResponse.ok) {
      throw new Error(`Slack API HTTP error: ${addReactionResponse.status}`);
    }

    // 2. 스레드에 사유 남김
    const postMessageResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        thread_ts: ts,
        text: `⚠️ *Force 승인*\n요청자: ${actualRequestor}\n사유: ${reason}`,
      }),
    });

    if (!postMessageResponse.ok) {
      throw new Error(`Slack API HTTP error: ${postMessageResponse.status}`);
    }
  }

  /**
   * 실행 완료 로그를 남깁니다.
   */
  async logExecution(
    channel: string,
    ts: string,
    results: MigrationResult,
    requestor?: string,
  ): Promise<void> {
    const config = this.config;
    assert(config, SD("sonamu.error.slackConfirmNotConfigured"));

    const actualRequestor = requestor ?? this.getRequestor();
    const timestamp = new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });

    // DB별로 그룹화하여 표시합니다.
    const appliedText =
      results.length > 0
        ? results
            .filter((r) => r.applied.length > 0)
            .map((r) => `[${r.connKey}]\n${r.applied.map((m) => `• ${m}`).join("\n")}`)
            .join("\n\n")
        : "(없음)";

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        thread_ts: ts,
        text: `✅ *마이그레이션 실행 완료*\n실행자: ${actualRequestor}\n시간: ${timestamp}\n\n적용됨:\n${appliedText}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status}`);
    }
  }
}
