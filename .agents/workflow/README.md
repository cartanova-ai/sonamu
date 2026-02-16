# 에이전틱 워크플로우 템플릿 번들

이 디렉토리는 다른 프로젝트에 바로 이식할 수 있는 워크플로우 템플릿입니다.
이 템플릿만으로 Prompt 기반 에이전트 개발 흐름을 설정할 수 있습니다.

## 목표
- 계획 중심의 자율 개발 흐름을 표준화합니다.
- 병렬 구현과 리뷰 루프를 안정적으로 운영합니다.
- 사용자 리뷰 전까지 품질 게이트를 일관되게 유지합니다.

## 설계 원칙
- Planning/Codex Execution/Branch Review/Orchestration은 Skill이 아니라 Prompt로 운영합니다.
- 공통 정책은 `prompts/00_shared_contract.md`를 단일 기준으로 사용합니다.
- incident/hotfix 버그 수정과 리뷰 유발 수정은 라우팅을 분리합니다.
- Codex MCP는 설치/가용 시에만 사용합니다.

## 포함된 템플릿
- `prompts/00_shared_contract.md`
- `prompts/00_bootstrap.md`
- `prompts/01_plan.md`
- `prompts/02_implement.md`
- `prompts/04_hotfix.md`
- `prompts/05_user_review_handoff.md`
- `prompts/06_codex_output_and_sessions.md`
- `prompts/07_orchestrator.md`
- `prompts/08_review_feedback_handler.md`
- `subagents/00_agent_roles.md`
- `skills/00_required_skills.md`

## 빠른 적용 절차
1. 대상 프로젝트 루트에 `AGENTS.md`를 준비합니다.
2. 호환성 심링크를 맞춥니다.
   - `CLAUDE.md -> AGENTS.md`
   - `.claude -> .agents`
3. 이 템플릿을 프로젝트의 `.agents/workflow/`로 복사합니다.
4. Orchestrator 실행 시 `prompts/00_shared_contract.md`를 공통 정책으로 먼저 로드합니다.
5. 아래 순서로 실행합니다.
   - `00_bootstrap -> 01_plan -> 07_orchestrator -> 02_implement/06_review/08_feedback -> 05_handoff`
   - incident/hotfix는 `04_hotfix` 경로를 사용합니다.

## 공통 운영 기준 요약
- 테스트 선행: `must_verify_behaviors`는 테스트를 먼저 작성하고 구현으로 통과시킵니다.
- 품질 게이트: 공통 필수 게이트 + 프로젝트별 override(`gate_profile`)를 함께 적용합니다.
- 리뷰 순서: 단위 리뷰 루프 -> 브랜치 리뷰 루프 -> 사용자 리뷰.
- 커밋 형식: `[scope] type: short title`, 진행 중은 `[scope] type(wip): short title`.
- 한국어 출력: 평서체를 사용하지 않고 `-합니다.` 문체로 작성합니다.
- 한국어 문체 규칙은 에이전트 응답, Notion/Linear/GitHub 출력에도 동일하게 적용합니다.

## 미래 통합
- Sonamu MCP, SocratsAI MCP는 준비 완료 시 통합합니다.
