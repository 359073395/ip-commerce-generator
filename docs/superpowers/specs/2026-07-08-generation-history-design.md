# Generation History Design

Date: 2026-07-08

## Goal

Add a stable generation history layer so each successful content generation becomes a reusable work record. This turns the app from a one-shot generator into a lightweight IP commerce content Agent system with memory, traceability, and per-user project isolation.

## Scope

- Store successful generation results with user, project, module, frontend form data, selected options, model name, result JSON, and timestamps.
- Keep daily quota counting unchanged through `generation_logs`.
- Expose user-scoped APIs for listing and reading generation history.
- Add a compact frontend history panel in the result area.
- Let users restore a historical generation into the current screen, including module, form data, selections, and result.
- Add dirty-data and permission tests: missing project, bad module, result persistence, cross-user isolation, and history limit safety.

## Non-Goals

- Do not store full prompts, knowledge excerpts, or raw model request messages.
- Do not build admin content review yet.
- Do not add new dependencies or a separate search engine.

## Data Model

Create `generation_records`:

- `id`
- `user_id`
- `project_id`
- `module_id`
- `module_label`
- `model`
- `request_json`
- `result_json`
- `created_at`

`generation_logs` remains the quota and admin-count source. `recordGeneration` writes both the quota log and the reusable history record when details are provided.

## API

- `GET /api/generations?projectId=&moduleId=&limit=`
  Returns recent records scoped to the logged-in user.
- `GET /api/generations/:recordId`
  Returns one record only if it belongs to the logged-in user.

The generate endpoint returns `{ record }` after a successful generation.

## Frontend

The result panel gains a “历史记录” section:

- Lists recent records for the active project and active module.
- Shows module name, generation time, summary preview, and model.
- “载入” restores the historical module, form values, selections, and result.
- “刷新” reloads history from the server.

## Tests

Add `test:generation-history` to verify:

- Successful generation records are persisted.
- History list is project/user scoped.
- Cross-user reads return no record.
- Limit is clamped.
- Malformed stored JSON does not crash record parsing.
