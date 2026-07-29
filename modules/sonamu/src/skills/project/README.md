# Project Skills

이 디렉토리는 프로젝트 고유의 문서를 저장하는 공간입니다.

## 용도

- **architecture.md**: 엔티티 설계와 시스템 아키텍처 문서

`architecture.md`는 `sonamu cone gen`이 LLM 컨텍스트로 실제 읽어들입니다
(`modules/sonamu/src/cone/cone-generator.ts`). 엔티티 설계를 확정한 뒤 이 파일에
기록해야 cone 생성 품질이 올라갑니다.

## 사용 방법

1. 엔티티 설계를 확정하면 `architecture.md`에 구조와 관계를 기록합니다.
2. 이후 대화에서 AI는 이 문서를 지속적으로 참고합니다.
3. 추가하고 싶은 내용이 있으면 이 디렉토리에 새로운 .md 파일을 추가하거나 기존 파일을 수정하세요.

## 주의사항

- 이 디렉토리의 파일들은 프로젝트별로 관리됩니다.
- Sonamu skills sync 시에도 덮어쓰지 않고 유지됩니다.
- 민감한 정보(비밀번호, API 키 등)는 절대 포함하지 마세요.
