/**
 * Miomock 한국어 Dictionary
 */
export default {
  // ===== 공통 =====
  "common.logout": "로그아웃",
  "common.login": "로그인",
  "common.create": "생성",
  "common.save": "저장",
  "common.cancel": "취소",
  "common.delete": "삭제",
  "common.backToList": "목록으로",
  "common.search": "검색",
  "common.searchType": "검색 유형",
  "common.sort": "정렬",
  "common.results": (count: number) => `${count}개 결과`,
  "common.edit": "수정",
  "common.createdAt": "등록",
  "common.manage": "관리",

  // ===== 메뉴 =====
  "menu.home": "홈",
  "menu.company": "회사 관리",
  "menu.user": "사용자 관리",
  "menu.department": "부서 관리",
  "menu.employee": "직원 관리",
  "menu.project": "프로젝트 관리",
  "menu.tag": "태그 관리",
  "menu.file": "파일 업로드",

  // ===== 대시보드 =====
  "dashboard.title": "관리자 대시보드",
  "dashboard.welcome": "환영합니다!",
  "dashboard.adminMenu": "관리 메뉴",
  "dashboard.name": "이름",
  "dashboard.email": "이메일",
  "dashboard.role": "역할",
  "dashboard.createdAt": "가입일",
  "dashboard.loginRequired": "로그인이 필요합니다.",

  // ===== 삭제 확인 다이얼로그 =====
  "delete.confirm.title": "정말 삭제하시겠습니까?",
  "delete.confirm.description": "이 작업은 취소할 수 없습니다. 항목이 영구적으로 삭제됩니다.",

  // ===== 폼 공통 =====
  "form.createdAt": "등록일",

  // ===== API 에러 메시지 =====
  "user.login.failed": "이메일 또는 비밀번호가 일치하지 않습니다",
  "user.logout.failed": "로그아웃 실패",
  "user.email.duplicate": "이미 사용중인 이메일입니다",
  "user.notFound": (id: number) => `존재하지 않는 User ID ${id}`,
  "employee.notFound": (id: number) => `존재하지 않는 Employee ID ${id}`,
  "company.notFound": (id: number) => `존재하지 않는 Company ID ${id}`,
  "department.notFound": (id: number) => `존재하지 않는 Department ID ${id}`,
  "project.notFound": (id: number) => `존재하지 않는 Project ID ${id}`,
  "tag.notFound": (id: number) => `존재하지 않는 Tag ID ${id}`,
  "file.notFound": (id: number) => `존재하지 않는 File ID ${id}`,
  "file.uploadFailed": "파일 업로드되지 않음",
  "document.notFound": (id: number) => `존재하지 않는 Document ID ${id}`,
  "syncFixture.notFound": (id: number) => `존재하지 않는 SyncFixture ID ${id}`,
  "search.invalidField": (field: string) => `구현되지 않은 검색 필드 ${field}`,

  // ===== 로그인 페이지 =====
  "login.title": "환영합니다",
  "login.subtitle": "계정에 로그인하세요",
  "login.email": "이메일",
  "login.password": "비밀번호",
  "login.submit": "로그인",
  "login.continueAs": (username: string) => `${username}(으)로 로그인`,
} as const;
