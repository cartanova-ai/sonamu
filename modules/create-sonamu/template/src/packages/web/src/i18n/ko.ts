// Simple josa helper - will be replaced by sonamu.shared after sync
function josa(word: string, _type: string): string {
  return word;
}

/**
 * Project KO Dictionary
 */
export default {
  "common.all": "전체",
  "common.backToList": "목록으로",
  "common.cancel": "취소",
  "common.close": "닫기",
  "common.confirm": "확인",
  "common.create": "생성",
  "common.createdAt": "등록",
  "common.delete": "삭제",
  "common.edit": "수정",
  "common.login": "로그인",
  "common.logout": "로그아웃",
  "common.manage": "관리",
  "common.results": (count: number) => `${count}개 결과`,
  "common.save": "저장",
  "common.search": "검색",
  "common.searchPlaceholder": "검색...",
  "common.searchType": "검색 유형",
  "common.sort": "정렬",
  "confirm.delete": "정말 삭제하시겠습니까?",
  "confirm.save": "저장하시겠습니까?",
  "dashboard.title": "대시보드",
  "dashboard.welcome": "환영합니다!",
  "delete.confirm.description": "이 작업은 취소할 수 없습니다. 항목이 영구적으로 삭제됩니다.",
  "delete.confirm.title": "정말 삭제하시겠습니까?",
  "entity.create": (name: string) => `${name} 생성`,
  "entity.edit": (name: string, id: number) => `${name} 수정 (#${id})`,
  "entity.list": (name: string) => `${name} 목록`,
  "entity.listManage": (name: string) => `${name} 목록 관리`,
  "error.badRequest": "잘못된 요청입니다",
  "error.duplicateRow": "중복된 데이터입니다",
  "error.forbidden": "권한이 없습니다",
  "error.internalServerError": "서버 오류가 발생했습니다",
  "error.notFound": "찾을 수 없습니다",
  "error.unauthorized": "인증이 필요합니다",
  notFound: (name: string, id: number) => `존재하지 않는 ${name} ID ${id}`,
  "validation.email": "올바른 이메일 형식이 아닙니다",
  "validation.maxLength": (field: string, max: number) =>
    `${field}은(는) 최대 ${max}자까지 입력할 수 있습니다`,
  "validation.minLength": (field: string, min: number) =>
    `${field}은(는) 최소 ${min}자 이상이어야 합니다`,
  "validation.required": (field: string) => `${josa(field, "은는")} 필수입니다`,
  "validation.url": "올바른 URL 형식이 아닙니다",
};
