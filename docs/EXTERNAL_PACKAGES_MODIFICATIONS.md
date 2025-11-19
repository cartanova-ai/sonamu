# 외부 패키지 수정사항

이 문서는 `modules` 디렉토리에 임포트된 오픈소스 패키지들의 수정사항을 정리한 요약본입니다.

각 패키지의 상세한 수정사항은 해당 패키지의 README.md 파일에서 확인하실 수 있습니다.

## 패키지 목록

### [@sonamu-kit/loader](../modules/loader/README.md)

**원본**: [@loaderkit/ts](https://github.com/braidnetworks/loaderkit) by [laverdet](https://github.com/laverdet)

**주요 변경사항**:
- ✅ 트랜스파일러 변경 (esbuild → swc)
- ✅ Yarn PnP Virtual 경로 지원
- ✅ `.ts` 확장자를 가진 Fully Resolved Path 처리
- ✅ Yarn PnP Virtual 경로 트랜스파일 제외

**상세 문서**: [modules/loader/README.md](../modules/loader/README.md#원본-패키지로부터의-주요-변경사항)

---

### [@sonamu-kit/hot-hook](../modules/hot-hook/README.md)

**원본**: [hot-hook](https://github.com/Julien-R44/hot-hook) by [Julien Ripouteau](https://github.com/Julien-R44)

**주요 변경사항**:
- ✅ 변수 기반 동적 Import 허용
- ✅ Boundary 간 정적 Import 허용
- ✅ @sonamu-kit/loader와의 통합
- ✅ 수동 파일 변경 알림 기능 (`invalidateFile()`)
- ✅ 전체 캐시 무효화 기능 (`invalidateAll()`)
- ✅ 의존성 트리에 없는 파일 처리

**상세 문서**: [modules/hot-hook/README.md](../modules/hot-hook/README.md#원본-패키지로부터의-주요-변경사항)

---

### [@sonamu-kit/hot-runner](../modules/hot-runner/README.md)

**원본**: [@hot-hook/runner](https://github.com/Julien-R44/hot-hook/tree/main/packages/runner) by [Julien Ripouteau](https://github.com/Julien-R44)

**주요 변경사항**:
- ℹ️ 원본 패키지를 **수정 없이 그대로 사용**

**상세 문서**: [modules/hot-runner/README.md](../modules/hot-runner/README.md#원본-패키지로부터의-변경사항)

---

## 수정 원칙

1. **최소한의 수정**: 원본 패키지의 기능을 최대한 유지하면서 필요한 부분만 수정합니다.
2. **주석 추가**: 수정한 부분에는 한글 주석으로 수정 이유와 내용을 명확히 기록합니다.
3. **원작자 크레딧**: README에 원작자와 원본 패키지 링크를 명시합니다.
4. **문서화**: 각 패키지의 README.md에 상세한 수정사항을 기록합니다.

## 문서 유지보수

- 각 패키지를 수정할 때마다 해당 패키지의 README.md를 **반드시** 업데이트합니다.
- 이 요약 문서는 각 패키지의 README.md로 링크를 제공하므로, 이 문서 자체는 수정할 필요가 없습니다.
- 새로운 패키지를 추가하는 경우에만 이 요약 문서에 링크를 추가합니다.

---

**최종 수정일**: 2025-11-19
