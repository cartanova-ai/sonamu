/**
 * Sonamu 내장 한국어 Dictionary
 * 프로젝트에서 동일한 키를 정의하면 덮어씁니다.
 */
export default {
  // 에러 메시지
  "error.badRequest": "잘못된 요청입니다",
  "error.unauthorized": "인증이 필요합니다",
  "error.forbidden": "권한이 없습니다",
  "error.notFound": "찾을 수 없습니다",
  "error.serviceUnavailable": "서비스를 사용할 수 없습니다",
  "error.internalServerError": "서버 오류가 발생했습니다",
  "error.alreadyProcessed": "이미 처리되었습니다",
  "error.duplicateRow": "중복된 데이터입니다",
  "error.targetNotFound": "대상을 찾을 수 없습니다",

  // 공통 UI
  "common.save": "저장",
  "common.cancel": "취소",
  "common.delete": "삭제",
  "common.edit": "수정",
  "common.create": "생성",
  "common.search": "검색",
  "common.searchPlaceholder": "검색...",
  "common.all": "전체",
  "common.confirm": "확인",
  "common.close": "닫기",
  "common.backToList": "목록으로",

  // 폼
  "form.createdAt": "생성일시",

  // 확인 메시지
  "confirm.delete": "정말 삭제하시겠습니까?",
  "confirm.save": "저장하시겠습니까?",

  // 검증 메시지 (템플릿 함수)
  "validation.required": (field: string) => `${field}은(는) 필수입니다`,
  "validation.minLength": (field: string, min: number) =>
    `${field}은(는) 최소 ${min}자 이상이어야 합니다`,
  "validation.maxLength": (field: string, max: number) =>
    `${field}은(는) 최대 ${max}자까지 입력할 수 있습니다`,
  "validation.range": (field: string, min: number, max: number) =>
    `${field}은(는) ${min}~${max} 사이여야 합니다`,
  "validation.email": "올바른 이메일 형식이 아닙니다",
  "validation.url": "올바른 URL 형식이 아닙니다",

  // Entity 페이지 (템플릿 함수)
  "entity.list": (name: string) => `${name} 목록`,
  "entity.listManage": (name: string) => `${name} 목록 관리`,
  "entity.create": (name: string) => `${name} 생성`,
  "entity.edit": (name: string, id: number) => `${name} 수정 (#${id})`,

  // 에러 메시지 (템플릿 함수)
  "error.entityNotFound": (name: string, id: number) => `존재하지 않는 ${name} ID ${id}`,
  "error.unknownSearchField": (field: string) => `구현되지 않은 검색 필드 ${field}`,
} as const;
