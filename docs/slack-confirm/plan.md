# Slack Confirm for Production Migration

## 개요

Production DB에 마이그레이션을 적용할 때 매니저(CTO/팀리드) 승인을 거치도록 하는 기능.
슬랙 메시지를 보내고, ✅ 이모지가 달리면 승인된 것으로 처리한다.

## 목표

- Production 마이그레이션은 "일상적이지 않은 별개의 태스크"로 인식되게 함
- 승인 없이도 force 진행 가능 (단, 사유 기록)
- 동일 마이그레이션 조합에 대해 이미 승인이 있으면 재요청 없이 바로 통과

> **슬랙 장애 시**: `sonamu.config.ts`에서 `slackConfirm` 블록을 주석 처리하면 기존 동작(승인 없이 바로 실행)으로 동작함

---

## Slack API 사용

### 필요한 권한 (Bot Token Scopes)

- `chat:write` - 메시지 발송, 스레드에 사유 남기기
- `reactions:read` - 이모지 조회
- `reactions:write` - 이모지 추가 (force 시 본인이 ✅ 찍기)

### 사용할 API

1. **chat.postMessage** - 승인 요청 메시지 발송
2. **reactions.get** - 해당 메시지의 이모지 조회 (Tier 3, 분당 50+회 가능)
3. **reactions.add** - force 시 본인이 ✅ 추가
4. **chat.postMessage** (with thread_ts) - 스레드에 사유/실행 로그 남기기

### Rate Limit

- `reactions.get`은 Tier 3 API로 분당 50회 이상 호출 가능
- 제한 초과 시 호출이 막히지 않고 응답이 지연됨
- Polling 간격 2초면 충분히 안전

---

## 설정 (sonamu.config.ts)

```typescript
export default defineConfig({
  // ... 기존 설정

  slackConfirm: {
    targets: ["production"], // 승인 필요한 DB 키 목록
    botToken: process.env.SLACK_BOT_TOKEN ?? "",
    channelId: process.env.SLACK_CHANNEL_ID ?? "", // 예: "C01234567"
  },
});
```

### 타입 정의 추가 (SonamuConfig)

```typescript
slackConfirm?: {
  targets: (keyof SonamuDBConfig)[];
  botToken: string;
  channelId: string;
}
```

---

## 로컬 파일 저장

### 위치

```
src/migrations/.slack-confirm-{hash}
```

### 파일명 규칙

- `{hash}` = 마이그레이션 이름 목록을 정렬 후 MD5 해시
- 예: `.slack-confirm-a1b2c3d4e5f6`

### 파일 내용

```
{channel_id}:{message_ts}
```

예: `C01234567:1705412345.000100`

### 해시 생성 로직

```typescript
import crypto from "crypto";

function getMigrationsHash(migrations: string[]): string {
  const sorted = [...migrations].sort();
  return crypto.createHash("md5").update(sorted.join(",")).digest("hex").slice(0, 12);
}
```

---

## 신규 파일: `src/migration/slack-confirm.ts`

```typescript
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Sonamu } from "../api";

export type SlackConfirmResult = {
  status: "approved" | "rejected" | "pending" | "not_configured" | "error";
  ts?: string;
  channel?: string;
  error?: string;
};

export class SlackConfirm {
  private config = Sonamu.config.slackConfirm;

  /**
   * 설정이 있는지 확인
   */
  isConfigured(): boolean {
    return !!(this.config?.botToken && this.config?.channelId);
  }

  /**
   * 해당 target이 승인 대상인지 확인
   */
  isTargetRequiresApproval(target: string): boolean {
    return this.config?.targets?.includes(target as any) ?? false;
  }

  /**
   * 마이그레이션 목록의 해시 생성
   */
  getMigrationsHash(migrations: string[]): string {
    const sorted = [...migrations].sort();
    return crypto.createHash("md5").update(sorted.join(",")).digest("hex").slice(0, 12);
  }

  /**
   * 로컬 파일 경로
   */
  private getConfirmFilePath(hash: string): string {
    return path.join(Sonamu.apiRootPath, "src", "migrations", `.slack-confirm-${hash}`);
  }

  /**
   * 기존 승인 요청 조회
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
   * 승인 요청 저장
   */
  async saveRequest(migrations: string[], channel: string, ts: string): Promise<void> {
    const hash = this.getMigrationsHash(migrations);
    const filePath = this.getConfirmFilePath(hash);
    await fs.writeFile(filePath, `${channel}:${ts}`, "utf-8");
  }

  /**
   * 슬랙 메시지 발송
   */
  async postApprovalRequest(
    migrations: string[],
    targets: string[],
    requestor?: string,
  ): Promise<{ channel: string; ts: string }> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config!.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: this.config!.channelId,
        text: this.buildMessageText(migrations, targets, requestor),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      channel: data.channel,
      ts: data.ts,
    };
  }

  /**
   * 메시지 텍스트 생성
   */
  private buildMessageText(migrations: string[], targets: string[], requestor?: string): string {
    const timestamp = new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
    const migrationsText = migrations.map((m) => `• ${m}`).join("\n");
    const targetsText = targets.join(", ");

    return `🗄️ *Production 마이그레이션 승인 요청*

*요청자:* ${requestor ?? "Unknown"}
*대상 DB:* ${targetsText}
*시간:* ${timestamp}

*적용 예정 마이그레이션:*
${migrationsText}

✅ 승인  ❌ 거절`;
  }

  /**
   * 승인 상태 확인 (reactions.get)
   */
  async checkApproval(
    channel: string,
    ts: string,
  ): Promise<{
    approved: boolean;
    rejected: boolean;
    approver?: string;
  }> {
    const response = await fetch(
      `https://slack.com/api/reactions.get?channel=${channel}&timestamp=${ts}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config!.botToken}`,
        },
      },
    );

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    const reactions = data.message?.reactions ?? [];
    const approved = reactions.find((r: any) => r.name === "white_check_mark");
    const rejected = reactions.find((r: any) => r.name === "x");

    return {
      approved: !!approved,
      rejected: !!rejected,
      approver: approved?.users?.[0],
    };
  }

  /**
   * Force 승인 처리 (본인이 ✅ 찍고 스레드에 사유 남김)
   */
  async forceApproval(
    channel: string,
    ts: string,
    reason: string,
    requestor?: string,
  ): Promise<void> {
    // 1. ✅ 이모지 추가
    await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config!.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        timestamp: ts,
        name: "white_check_mark",
      }),
    });

    // 2. 스레드에 사유 남김
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config!.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        thread_ts: ts,
        text: `⚠️ *Force 승인*\n요청자: ${requestor ?? "Unknown"}\n사유: ${reason}`,
      }),
    });
  }

  /**
   * 실행 완료 로그 남기기
   */
  async logExecution(
    channel: string,
    ts: string,
    result: { applied: string[]; batchNo: number },
    requestor?: string,
  ): Promise<void> {
    const timestamp = new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
    const appliedText =
      result.applied.length > 0 ? result.applied.map((m) => `• ${m}`).join("\n") : "(없음)";

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config!.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        thread_ts: ts,
        text: `✅ *마이그레이션 실행 완료*\n실행자: ${
          requestor ?? "Unknown"
        }\n시간: ${timestamp}\nBatch: ${result.batchNo}\n\n적용됨:\n${appliedText}`,
      }),
    });
  }
}
```

---

## API 수정

### 1. `/api/migrations/runAction` 수정

**파일:** `src/ui/api.ts`

기존 코드:

```typescript
server.post<{
  Body: {
    action: "apply" | "rollback" | "shadow";
    targets: (keyof SonamuDBConfig)[];
  };
}>("/api/migrations/runAction", async (request): Promise<MigrationResult> => {
  const { action, targets } = request.body;

  if (action === "shadow") {
    return migrator.runShadowTest();
  } else {
    return migrator.runAction(action, targets);
  }
});
```

수정 후:

```typescript
server.post<{
  Body: {
    action: "apply" | "rollback" | "shadow";
    targets: (keyof SonamuDBConfig)[];
    force?: boolean;
    forceReason?: string;
    requestor?: string;
  };
}>("/api/migrations/runAction", async (request): Promise<MigrationResult | SlackConfirmPendingResult> => {
  const { action, targets, force, forceReason, requestor } = request.body;

  if (action === "shadow") {
    return migrator.runShadowTest();
  }

  // Slack 승인 체크 (apply 시에만)
  if (action === "apply") {
    const slackConfirm = new SlackConfirm();
    const requiresApproval = targets.some((t) => slackConfirm.isTargetRequiresApproval(t));

    if (requiresApproval && slackConfirm.isConfigured()) {
      const { codes } = await migrator.getStatus();
      const pendingMigrations = /* pending migrations 목록 가져오기 */;

      if (pendingMigrations.length > 0) {
        // 기존 승인 요청 확인
        const existing = await slackConfirm.getExistingRequest(pendingMigrations);

        if (existing) {
          // 기존 요청이 있으면 승인 상태 확인
          const { approved, rejected } = await slackConfirm.checkApproval(existing.channel, existing.ts);

          if (approved) {
            // 승인됨 → 실행
            const result = await migrator.runAction(action, targets);
            await slackConfirm.logExecution(existing.channel, existing.ts, result[0], requestor);
            return result;
          } else if (rejected) {
            throw new Error("마이그레이션이 거절되었습니다.");
          } else if (force) {
            // Force 진행
            await slackConfirm.forceApproval(existing.channel, existing.ts, forceReason ?? "사유 없음", requestor);
            const result = await migrator.runAction(action, targets);
            await slackConfirm.logExecution(existing.channel, existing.ts, result[0], requestor);
            return result;
          } else {
            // 대기중
            return {
              status: "pending",
              channel: existing.channel,
              ts: existing.ts,
            };
          }
        } else {
          // 새 승인 요청 발송
          const { channel, ts } = await slackConfirm.postApprovalRequest(
            pendingMigrations,
            targets,
            requestor
          );
          await slackConfirm.saveRequest(pendingMigrations, channel, ts);

          return {
            status: "pending",
            channel,
            ts,
          };
        }
      }
    }
  }

  return migrator.runAction(action, targets);
});
```

### 2. 새 API: `/api/migrations/checkApproval`

```typescript
server.post<{
  Body: {
    channel: string;
    ts: string;
  };
}>("/api/migrations/checkApproval", async (request) => {
  const { channel, ts } = request.body;
  const slackConfirm = new SlackConfirm();

  if (!slackConfirm.isConfigured()) {
    return { approved: true, rejected: false };
  }

  return slackConfirm.checkApproval(channel, ts);
});
```

### 3. 새 API: `/api/migrations/forceApproval`

```typescript
server.post<{
  Body: {
    channel: string;
    ts: string;
    reason: string;
    requestor?: string;
  };
}>("/api/migrations/forceApproval", async (request) => {
  const { channel, ts, reason, requestor } = request.body;
  const slackConfirm = new SlackConfirm();

  if (!slackConfirm.isConfigured()) {
    throw new Error("Slack confirm is not configured");
  }

  await slackConfirm.forceApproval(channel, ts, reason, requestor);
  return { success: true };
});
```

---

## UI Service 추가

**파일:** `ui-web/src/services/sonamu-ui.service.ts`

```typescript
export type SlackConfirmPendingResult = {
  status: "pending";
  channel: string;
  ts: string;
};

export function migrationsRunAction(
  action: "apply" | "rollback" | "shadow",
  targets: (keyof SonamuDBConfig)[],
  options?: {
    force?: boolean;
    forceReason?: string;
    requestor?: string;
  },
): Promise<MigrationResult | SlackConfirmPendingResult> {
  return fetch({
    method: "POST",
    url: `/sonamu-ui/api/migrations/runAction`,
    data: {
      action,
      targets,
      ...options,
    },
  });
}

export function migrationsCheckApproval(
  channel: string,
  ts: string,
): Promise<{ approved: boolean; rejected: boolean }> {
  return fetch({
    method: "POST",
    url: `/sonamu-ui/api/migrations/checkApproval`,
    data: { channel, ts },
  });
}

export function migrationsForceApproval(
  channel: string,
  ts: string,
  reason: string,
  requestor?: string,
): Promise<{ success: boolean }> {
  return fetch({
    method: "POST",
    url: `/sonamu-ui/api/migrations/forceApproval`,
    data: { channel, ts, reason, requestor },
  });
}
```

---

## UI 수정

**파일:** `ui-web/src/routes/migrations/_migration_action_modal.tsx`

### 주요 변경사항

1. **상태 추가**

```typescript
const [approvalState, setApprovalState] = useState<{
  status: "idle" | "pending" | "approved" | "rejected";
  channel?: string;
  ts?: string;
}>({ status: "idle" });

const [forceModalOpen, setForceModalOpen] = useState(false);
const [forceReason, setForceReason] = useState("");
```

2. **handleSubmit 수정**

```typescript
const handleSubmit = async () => {
  setLoading(true);
  try {
    if (form.doShadowDbTesting) {
      await SonamuUIService.migrationsRunAction("shadow", targets);
    }

    const result = await SonamuUIService.migrationsRunAction(action, targets, {
      requestor: "현재 유저", // 실제로는 세션에서 가져오기
    });

    // Slack 승인 대기 상태 체크
    if ("status" in result && result.status === "pending") {
      setApprovalState({
        status: "pending",
        channel: result.channel,
        ts: result.ts,
      });
      // polling 시작
      startPolling(result.channel, result.ts);
    } else {
      onOpenChange(false);
      onCompleted?.();
    }
  } catch (e) {
    defaultCatch(e);
  } finally {
    setLoading(false);
  }
};
```

3. **Polling 로직**

```typescript
const pollingRef = useRef<NodeJS.Timeout | null>(null);

const startPolling = (channel: string, ts: string) => {
  pollingRef.current = setInterval(async () => {
    try {
      const { approved, rejected } = await SonamuUIService.migrationsCheckApproval(channel, ts);

      if (approved) {
        stopPolling();
        // 승인됨 → 실행
        const result = await SonamuUIService.migrationsRunAction(action, targets, {
          requestor: "현재 유저",
        });
        if (!("status" in result)) {
          onOpenChange(false);
          onCompleted?.();
        }
      } else if (rejected) {
        stopPolling();
        setApprovalState({ status: "rejected" });
      }
    } catch (e) {
      console.error("Polling error:", e);
    }
  }, 2000); // 2초마다 polling
};

const stopPolling = () => {
  if (pollingRef.current) {
    clearInterval(pollingRef.current);
    pollingRef.current = null;
  }
};

useEffect(() => {
  return () => stopPolling();
}, []);
```

4. **Force 처리**

```typescript
const handleForce = async () => {
  if (!approvalState.channel || !approvalState.ts) return;

  setLoading(true);
  try {
    await SonamuUIService.migrationsForceApproval(
      approvalState.channel,
      approvalState.ts,
      forceReason,
      "현재 유저",
    );

    const result = await SonamuUIService.migrationsRunAction(action, targets, {
      force: true,
      forceReason,
      requestor: "현재 유저",
    });

    if (!("status" in result)) {
      onOpenChange(false);
      onCompleted?.();
    }
  } catch (e) {
    defaultCatch(e);
  } finally {
    setLoading(false);
    setForceModalOpen(false);
  }
};
```

5. **UI 렌더링**

```tsx
{
  approvalState.status === "pending" && (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-medium">승인 대기중...</span>
      </div>
      <p className="text-sm text-gray-600 mb-4">슬랙에서 ✅ 이모지를 눌러 승인해주세요.</p>
      <Button variant="outline" onClick={() => setForceModalOpen(true)}>
        Force 진행
      </Button>
    </div>
  );
}

{
  approvalState.status === "rejected" && (
    <div className="p-4 bg-red-50 border border-red-200 rounded">
      <span className="font-medium text-red-600">❌ 마이그레이션이 거절되었습니다.</span>
    </div>
  );
}

{
  /* Force 사유 입력 모달 */
}
<Dialog open={forceModalOpen} onOpenChange={setForceModalOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Force 진행</DialogTitle>
      <DialogDescription>승인 없이 진행합니다. 사유를 입력해주세요.</DialogDescription>
    </DialogHeader>
    <Textarea
      placeholder="사유 입력..."
      value={forceReason}
      onChange={(e) => setForceReason(e.target.value)}
    />
    <DialogFooter>
      <Button variant="outline" onClick={() => setForceModalOpen(false)}>
        취소
      </Button>
      <Button onClick={handleForce} disabled={!forceReason.trim()}>
        진행
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>;
```

---

## 테스트 시나리오

1. **정상 플로우**
   - Apply 클릭 → 슬랙 메시지 발송 → 대기 → ✅ 클릭 → 실행

2. **기존 승인 있는 경우**
   - Apply 클릭 → 기존 ts로 reactions.get → ✅ 있음 → 바로 실행

3. **거절**
   - Apply 클릭 → 대기 → ❌ 클릭 → 거절 메시지

4. **Force 진행**
   - Apply 클릭 → 대기 → Force 버튼 → 사유 입력 → 실행 (슬랙에 로그 남음)

5. **슬랙 설정 없음**
   - `slackConfirm` 설정 없으면 기존 동작과 동일 (바로 실행)

6. **대상 아닌 DB**
   - `targets`에 없는 DB는 승인 없이 바로 실행

---

## 파일 변경 요약

| 파일                                                       | 변경 내용                                               |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `src/types/types.ts`                                       | `SonamuConfig`에 `slackConfirm` 타입 추가               |
| `src/migration/slack-confirm.ts`                           | **신규** - SlackConfirm 클래스                          |
| `src/ui/api.ts`                                            | `runAction` 수정, `checkApproval`, `forceApproval` 추가 |
| `ui-web/src/services/sonamu-ui.service.ts`                 | 새 API 메서드 추가                                      |
| `ui-web/src/routes/migrations/_migration_action_modal.tsx` | 승인 대기 UI, polling, force 모달 추가                  |

---

## Slack App 생성 가이드

1. https://api.slack.com/apps → Create New App
2. "From scratch" 선택
3. App Name: "Sonamu Migration" (또는 원하는 이름)
4. Workspace 선택

### Bot Token Scopes 추가

OAuth & Permissions → Scopes → Bot Token Scopes:

- `chat:write`
- `reactions:read`
- `reactions:write`

### 설치

- Install to Workspace 클릭
- Bot User OAuth Token 복사 (`xoxb-...`)

### 채널에 봇 초대

- 원하는 채널에서 `/invite @봇이름`
- 채널 ID 확인 (채널 이름 우클릭 → "링크 복사" → URL에서 `C...` 부분)

### 환경변수 설정

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C01234567
```
