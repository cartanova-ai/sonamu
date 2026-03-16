# Phase 1: Draft

Spec 초안을 생성한다.

## 선행 읽기 (필수)

- `../../api/contract/cdd.md`
- `../00_cdd_contract.md`

## 입력

```yaml
spec_name: "{생성할 spec 파일명}"
domain: "{도메인 디렉토리}"
contract_paths: ["{참조할 contract 경로}"]
```

## 작업 순서

1. 참조 Contract 파일을 읽고 대상 feature를 확인한다.
   - Contract의 `features` 필드에서 해당 feature key와 설명을 확인한다.
   - feature key가 Contract에 없으면 오케스트레이터에 보고하고 중단한다.

2. Spec을 생성한다.
   ```bash
   cd examples/miomock/api
   cdd spec create {spec_name} --domain {domain} --contract {contract_path}
   ```

3. 생성된 Spec의 기본 필드를 채운다.
   - `summary`: Contract feature 설명을 기반으로 한 줄 요약
   - `description`: feature의 기술적 설명 (1~3줄)
   - `contracts`: 참조 Contract 경로 (상대 경로)

4. Spec 파일을 저장한다.

## 산출물

```yaml
spec_path: "{생성된 spec 파일 경로}"
status: "draft"
summary: "{작성한 summary}"
```

## 금지 사항

- custom field(schema에 정의된 필드)를 이 단계에서 채우지 않는다.
- AC를 이 단계에서 정의하지 않는다.
- 코드를 작성하지 않는다.
