# Required and Reference Skills

## Canonical skill sources (deduplicated)

1. https://skills.sh/vercel-labs/agent-skills
2. https://skills.sh/expo/skills
3. https://github.com/callstackincubator/agent-skills/tree/main/skills/react-native-best-practices
4. https://github.com/mobile-next/mobile-mcp
5. https://github.com/microsoft/playwright-mcp

## Skill installation standard

- Use https://github.com/vercel-labs/skills as the primary installer workflow.
- Supported install paths:
  - `pnpm add -g @vercel/skills` then `skill install <author>/<skill-name>`
  - `pnpx @vercel/skills install <author>/<skill-name>`
- Discover before install:
  - `skill list`
  - `skill search <keyword>`
- For this workflow, prefer installing required skills before orchestration starts, then pass selected skill links to subagents.

## Deduplicated mapping (for traceability)

- `https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices` is covered by canonical source #1.
- `https://github.com/vercel-labs/agent-skills/tree/main/skills/react-native-skills` is covered by canonical source #1.
- `https://github.com/expo/skills` is covered by canonical source #2.

## Reference docs required before prompt generation

5. https://code.claude.com/docs/en/sub-agents
6. https://agentskills.io/home

## Usage instructions

- For each project setup, include a short note of which skill groups are selected from each source.
- Treat these as optional by environment fit, but required to be evaluated each time the workflow is initialized.
- If a project does not align with a domain (e.g., no Expo surface), explicitly skip that group in the bootstrap output.
- Keep skill references in the bootstrap prompt output so review can verify alignment.
- If skill behavior is unclear, clone canonical skill repositories into a temporary directory and inspect relevant `SKILL.md` files before planning.

## Framework-specific required skills

- React projects must reference `vercel-react-best-practices`.
- React Native projects must reference `vercel-react-best-practices`, `vercel-react-native-skills`, and `react-native-best-practices`.
- React Native projects must also evaluate and apply Expo Skills (at minimum: `expo-app-design`, `upgrading-expo`, `expo-deployment`).
- React Native runtime validation must use `mobile-mcp` for Android Emulator and iOS Simulator management.
- React Native runtime validation must not use physical devices.
- Web Frontend projects must use `Playwright MCP` for browser-level validation.
- If a required skill is unavailable, document the missing skill and use the closest available fallback while keeping the same quality intent.

## Link-first skill context policy

- Provide direct links to selected skills in orchestrator prompts and subagent prompts.
- Include a one-line purpose summary for each linked skill in the prompt context.
- Include the priority order defined by the selected skill so agents can rank findings and tasks consistently.
- For React Native tasks, include both skill links and `mobile-mcp` link so execution agents can use the exact runtime-management toolchain.
- For Web Frontend tasks, include the `Playwright MCP` link so execution agents can run browser validation consistently.

## Multi-agent best-practice analysis mode

- When the task is analysis-only (for example, refactoring candidate discovery), split the selected skill into small categories.
- Spawn as many analysis subagents as safely parallelizable, with one narrow category per agent.
- Require each analysis subagent to return plan-only output, not code changes.
- Require the main orchestrator to score and prioritize merged plans using skill-defined priority.
