import { registerSSR } from "sonamu/ssr";
import { CompanyService, UserService } from "../application/queries.generated";

// 테스트용: 회사 목록 페이지 SSR
registerSSR({
  path: "/admin/companies",
  preload: () => [
    // 유저 정보 preload
    UserService.me(),
    // 회사 목록 preload (첫 10개)
    CompanyService.getCompanies("A", {
      num: 10,
      page: 1,
      search: "id",
      keyword: "",
      orderBy: "id-desc",
    }),
  ],
});

// 테스트용: 회사 상세 페이지 SSR
registerSSR({
  path: "/admin/companies/:companyId",
  preload: (params) => [
    // 유저 정보 preload
    UserService.me(),
    // 회사 상세 정보 preload
    CompanyService.getCompany("A", Number(params.companyId)),
  ],
});

// 테스트용: Admin 로그인 페이지
registerSSR({
  path: "/admin/login",
  preload: () => [UserService.me()],
});
