/**
 * Better Auth dash() 플러그인이 POST ${apiUrl}/events/track으로 전송하는 이벤트 body 타입
 */
export type AuditLogEvent = {
  eventType: string;
  eventData: Record<string, unknown>;
  eventKey: string;
  eventDisplayName?: string;
  ipAddress?: string;
  city?: string;
  country?: string;
  countryCode?: string;
};

/**
 * AuditLog 프록시 옵션
 */
export type AuditLogProxyOptions = {
  /** 프록시 base path (기본값: "/api/audit-log") */
  basePath?: string;
  /** 이벤트 수신 시 콜백 (향후 DB 적재 확장 포인트) */
  onEvent?: (event: AuditLogEvent) => void | Promise<void>;
};
