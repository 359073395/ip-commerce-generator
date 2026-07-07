# Quality Tuning And Knowledge Enhancement Design

## Goal

Turn model quality tuning from a subjective manual check into a repeatable benchmark, and turn the knowledge base from large handbook retrieval into handbook sections plus structured method blocks.

## Scope

1. Standard benchmark cases.
   - Store at least 30 representative cases in `knowledge/quality-benchmark-cases.json`.
   - Cover IP positioning, viral topics, conversion topics, pain topics, scripts, rewrites, viral analysis, polishing, commerce, profile memory, and dirty data.
   - Each case declares module, form data, frontend selections, expected knowledge terms, and minimum score.

2. Structured knowledge blocks.
   - Store method cards in `knowledge/structured-blocks.json`.
   - Each block declares module coverage, category, methods, scenarios, required inputs, output skeleton, example, and keywords.
   - Retrieval uses these blocks before handbook sections so important methods such as IP定位、八大爆款元素、四类脚本卡、成交链路、痛点挖掘、4P、信任证明 are consistently present.

3. Offline benchmark runner.
   - `server/quality/benchmarkRunner.mjs` loads benchmark cases, retrieves knowledge, builds a synthetic passing result, and scores it with the existing quality evaluator.
   - This verifies the system assets without consuming model tokens.

4. Real model benchmark command.
   - `npm run benchmark:models` defaults to offline mode.
   - Set `RUN_REAL_MODEL_BENCHMARK=true`, `COMPARE_MODELS`, and API env vars to compare real models on the same cases.

5. Admin visibility.
   - `/api/health` exposes structured knowledge and benchmark case status.
   - Admin system status shows knowledge block count and test case count.

## Non-goals

This phase does not add vector search, streaming generation, background queues, or persistent benchmark reports. It creates the stable foundation needed before those heavier systems.

## Success Criteria

- Existing generation behavior remains compatible.
- Knowledge retrieval includes structured blocks and handbook sections.
- Offline benchmark has at least 30 cases and passes locally.
- Admin health confirms knowledge blocks and benchmark cases are present.
- Build and existing tests still pass.
