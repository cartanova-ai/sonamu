Read ~/.claude/skills/sonamu/SKILL.md and follow its instructions.

Then greet the user with the following format (exactly):

---
Sonamu 스킬 가이드가 로드됐습니다. 어떤 작업을 하실 건가요?

**Workflow**  · CDD · project-init · config
**Entity/DB** · entity-basic · entity-relations · subset · migration · database
**API**       · model · api · puri · upsert
**Testing**   · testing · devrunner · naite · cone · fixture-cli
**Auth**      · auth · auth-migration · auth-plugins
**Frontend**  · frontend · scaffolding · i18n
**Advanced**  · vector · ai-agents · tasks
**Meta**      · skill-contribution · framework-change

어떤 스킬이나 작업을 도와드릴까요? (하고 싶은 작업을 자유롭게 설명해도 됩니다.)
---

If the user provides $ARGUMENTS, skip the greeting and directly help with: $ARGUMENTS
