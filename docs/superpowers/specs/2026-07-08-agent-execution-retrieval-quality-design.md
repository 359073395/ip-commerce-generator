# Agent Execution, Retrieval, and Quality Design

## Goal

Turn the current IP commerce generator into a more automatic Agent system without changing the original-style module experience. A user should be able to enter one business goal, let the Agent plan the path, execute the right module sequence, reuse earlier step outputs as context, retrieve stronger knowledge snippets, and see whether the final content passed a productized quality check.

## Scope

This phase covers three connected improvements:

- Automatic execution chain: goal -> planner -> ordered module steps -> generation records -> Agent run record.
- Stronger knowledge retrieval: better scoring, source diversity, and retrieval metadata for later auditing.
- Quality evaluation: deterministic score and checks attached to generation results and Agent steps.

It does not introduce background queues, paid billing, streaming output, or external vector databases. The first version remains synchronous for VPS simplicity.

## Execution Chain

The backend will expose `POST /api/agent/run`. It receives `goal`, `projectId`, and optional `maxSteps`. The server loads the user's project profile, calls the existing planner, and only generates when the plan is `ready`. If the plan is `invalid` or `needs_input`, it returns a saved run with questions and no model calls.

The run step order is rule based:

- personal IP: `ip-positioning -> viral-topics -> script`
- commerce video: `commerce -> script`
- combined IP plus conversion: `ip-positioning -> conversion-topics -> script`
- explicit user intent can bring `pain-topics`, `viral-topics`, `conversion-topics`, `script`, `rewrite`, `polish`, or `viral-analysis` into the chain.

Every step calls the same generation service used by `/api/generate`, so normal generation and Agent execution share prompt construction, model fallback, review, generation history, and daily quota rules. Later steps receive previous step summaries in `context.agentPreviousSteps`.

## Persistence

Add an `agent_runs` table:

- `id`, `user_id`, `project_id`, `goal`, `status`, `plan_json`, `steps_json`, `created_at`, `updated_at`

The API also exposes run history endpoints for product UI and debugging:

- `GET /api/agent/runs`
- `GET /api/agent/runs/:runId`

All reads stay user-scoped.

## Knowledge Retrieval

The retriever still reads local Markdown handbooks, but ranking becomes more deliberate:

- normalize and deduplicate query terms
- boost exact heading hits and phrase hits
- add module-specific terms such as 4P, eight viral elements, pain points, CTA, visual proof, and conversion path
- keep source diversity so combined tasks do not accidentally use only one handbook
- return retrieval metadata with selected source, heading, score, and matched terms

The prompt receives the same compact knowledge pack, while generation history and quality checks can inspect retrieval metadata.

## Quality Evaluation

Add deterministic quality evaluation after the reviewed model result. The evaluator scores:

- completeness of sections, tables, scripts, next actions, and risk notes
- use of user facts from form fields, selections, context, and project profile
- use of retrieved knowledge evidence
- actionability for IP positioning, content topic, script, or commerce output
- safety/risk awareness

The score is 0-100 with levels:

- `excellent` >= 85
- `pass` >= 70
- `needs_review` < 70

The result object includes `quality`, and the frontend renders a compact quality card in the result panel.

## Testing

Add focused tests:

- `test:agent-execution`: step planning, max-step clamp, previous context, persistence, and user isolation with stub generation.
- `test:knowledge-retrieval`: module-specific and combined retrieval selects relevant handbook sections with metadata.
- `test:quality-evaluation`: rich results score high, thin results score low, and missing user facts/risk notes lower the score.

Before pushing, run the existing suite plus the new tests and `npm run build`.
