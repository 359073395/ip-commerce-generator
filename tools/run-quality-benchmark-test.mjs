import assert from 'node:assert/strict';
import { runOfflineQualityBenchmark } from '../server/quality/benchmarkRunner.mjs';
import { getKnowledgeOptimizationStatus } from '../server/knowledge/loadKnowledge.mjs';

const status = await getKnowledgeOptimizationStatus();
assert.ok(status.structuredBlocks.ok, 'structured knowledge blocks should be available');
assert.ok(status.structuredBlocks.count >= 10, 'structured knowledge should contain at least 10 blocks');
assert.ok(status.benchmarkCases.ok, 'quality benchmark should contain at least 30 cases');

const benchmark = await runOfflineQualityBenchmark();
assert.ok(benchmark.ok, `${benchmark.failed} benchmark cases failed`);
assert.ok(benchmark.averageScore >= 85, `average benchmark score should stay high, got ${benchmark.averageScore}`);
assert.ok(benchmark.byModule.script?.total >= 4, 'benchmark should cover script cases');
assert.ok(benchmark.byModule.commerce?.total >= 4, 'benchmark should cover commerce cases');
assert.ok(benchmark.byModule['ip-positioning']?.total >= 4, 'benchmark should cover IP positioning cases');

console.log(JSON.stringify({
  ok: true,
  structuredBlocks: status.structuredBlocks.count,
  benchmarkCases: benchmark.total,
  averageScore: benchmark.averageScore,
  byModule: benchmark.byModule,
  message: 'Quality benchmark and structured knowledge tests passed.',
}, null, 2));
