import { loadKnowledgePack, loadQualityBenchmarkCases } from '../knowledge/loadKnowledge.mjs';
import { getModuleDefinition } from '../prompt-engine/modules.mjs';
import { evaluateResultQuality } from './evaluateResultQuality.mjs';

export async function runOfflineQualityBenchmark({ limit } = {}) {
  const benchmark = await loadQualityBenchmarkCases();
  const cases = Number(limit) > 0 ? benchmark.cases.slice(0, Number(limit)) : benchmark.cases;
  const results = [];

  for (const testCase of cases) {
    const definition = getModuleDefinition(testCase.moduleId);
    const requestBody = buildRequestBody(testCase);
    const knowledgePack = await loadKnowledgePack({
      taskType: testCase.taskType || definition.taskType,
      moduleId: definition.id,
      label: definition.label,
      knowledge: definition.knowledge,
      output: definition.output,
      formData: requestBody.formData,
      selections: requestBody.selections,
      context: requestBody.context,
      budgetChars: 1800,
    });
    const syntheticResult = buildSyntheticPassingResult({
      testCase,
      definition,
      knowledge: knowledgePack.selected,
      requestBody,
    });
    const quality = evaluateResultQuality({
      result: syntheticResult,
      definition,
      knowledge: knowledgePack.selected,
      requestBody,
    });
    const expectedHits = countExpectedKnowledgeHits(testCase.expectedKnowledge || [], knowledgePack.selected);
    const passed = quality.score >= Number(testCase.minimumScore || 70)
      && expectedHits >= Math.min(2, (testCase.expectedKnowledge || []).length || 2)
      && knowledgePack.retrieval.selectedStructuredBlocks >= 1;

    results.push({
      id: testCase.id,
      name: testCase.name,
      moduleId: definition.id,
      minimumScore: Number(testCase.minimumScore || 70),
      score: quality.score,
      level: quality.level,
      expectedHits,
      expectedKnowledge: testCase.expectedKnowledge || [],
      selectedStructuredBlocks: knowledgePack.retrieval.selectedStructuredBlocks,
      selectedSources: knowledgePack.retrieval.selectedSources,
      missing: quality.missing,
      passed,
    });
  }

  const failed = results.filter((item) => !item.passed);
  const byModule = summarizeBy(results, (item) => item.moduleId);
  return {
    ok: failed.length === 0 && cases.length >= 30,
    version: benchmark.version,
    total: cases.length,
    passed: results.length - failed.length,
    failed: failed.length,
    averageScore: Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(1, results.length)),
    byModule,
    failures: failed,
    results,
  };
}

function buildRequestBody(testCase) {
  return {
    moduleId: testCase.moduleId,
    formData: testCase.formData || {},
    selections: testCase.selections || [],
    context: {
      projectProfile: testCase.projectProfile || {},
      agentGoal: testCase.name,
    },
    projectProfile: testCase.projectProfile || {},
  };
}

function buildSyntheticPassingResult({ testCase, definition, knowledge, requestBody }) {
  const facts = extractFacts(requestBody);
  const selections = extractSelections(requestBody);
  const knowledgeTerms = extractKnowledgeTerms(knowledge);
  const expected = testCase.expectedKnowledge || [];
  const factLine = [...facts, ...selections, ...expected, ...knowledgeTerms].filter(Boolean).slice(0, 18).join('、');
  const summary = `${testCase.name}：围绕${factLine || definition.label}生成完整骨架，并保留待确认和风险提醒。`;
  return {
    module: definition.label || definition.id,
    summary,
    sections: [
      {
        title: '信息判断',
        items: [
          `用户事实：${facts.join('、') || '信息不足，需要补充行业、产品、目标用户和承接方式。'}`,
          `前端选择：${selections.join('、') || '本模块无额外前端选择。'}`,
          `知识库方法：${knowledgeTerms.join('、') || expected.join('、')}`,
        ],
      },
      {
        title: '完整生成骨架',
        items: [
          `必须覆盖：${(definition.output || []).join('、')}`,
          `命中知识：${expected.join('、')}`,
          '如果信息不足，先给可执行初版，再列出待确认项。',
        ],
      },
      {
        title: '执行建议',
        items: [
          '先确认目标用户和转化入口。',
          '再按知识库方法生成选题、脚本、拍摄和CTA。',
          '最后用质量评估检查用户事实、前端选择和知识库证据。',
        ],
      },
    ],
    tables: [
      {
        title: '执行表',
        columns: ['环节', '生成要求', '知识依据'],
        rows: [
          ['定位/选题', facts[0] || testCase.name, expected[0] || '知识库方法'],
          ['脚本/承接', selections[0] || '完整骨架', expected[1] || 'CTA'],
          ['复核', '人工核验事实和承诺', '风险提醒'],
        ],
      },
    ],
    scripts: [
      {
        title: `${definition.label || definition.id}示例脚本`,
        hook: `${expected[0] || '黄金3秒'}：${facts[0] || testCase.name}最容易忽略的一步是什么？`,
        body: [
          `第一段结合用户事实：${facts.slice(0, 4).join('、') || testCase.name}。`,
          `第二段结合前端选择：${selections.join('、') || '按模块默认流程展开'}。`,
          `第三段结合知识库方法：${expected.concat(knowledgeTerms).slice(0, 6).join('、')}。`,
        ],
        shots: ['真人口播或产品/现场镜头', '证明材料或过程镜头', 'CTA字幕和承接入口'],
        cta: selections.find((item) => /私信|表单|到店|课程|商品|TikTok|团购|预约/.test(item)) || '评论关键词或私信获取下一步方案',
      },
    ],
    nextActions: ['补齐待确认事实', '按模块输出完整方案', '用质量评分复核后再发布'],
    riskNotes: ['涉及效果、价格、资质、案例或承诺时必须人工核验，禁止编造用户未提供的信息。'],
  };
}

function countExpectedKnowledgeHits(expectedTerms, selectedKnowledge) {
  const haystack = selectedKnowledge.map((item) => [
    item.heading,
    item.source,
    ...(item.matchedTerms || []),
    ...(item.methods || []),
    item.category,
  ].filter(Boolean).join(' ')).join('\n').toLowerCase();
  return expectedTerms.filter((term) => haystack.includes(String(term).toLowerCase())).length;
}

function extractFacts(requestBody) {
  const values = [];
  collectStringValues(requestBody.formData, values);
  collectStringValues(requestBody.projectProfile, values);
  collectStringValues(requestBody.context?.projectProfile, values);
  return unique(values).slice(0, 12);
}

function extractSelections(requestBody) {
  const values = [];
  for (const selection of requestBody.selections || []) {
    if (selection.choice) values.push(selection.choice);
    if (selection.subChoice) values.push(selection.subChoice);
    if (Array.isArray(selection.choices)) values.push(...selection.choices);
  }
  return unique(values).slice(0, 12);
}

function extractKnowledgeTerms(knowledge = []) {
  return unique(knowledge.flatMap((item) => [
    item.heading,
    ...(item.matchedTerms || []),
    ...(item.methods || []),
  ])).slice(0, 12);
}

function collectStringValues(input, output) {
  if (!input || typeof input !== 'object') return;
  for (const value of Object.values(input)) {
    if (typeof value === 'string') output.push(value);
    else if (Array.isArray(value)) output.push(...value.filter((item) => typeof item === 'string'));
    else if (value && typeof value === 'object') collectStringValues(value, output);
  }
}

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized.slice(0, 120));
  }
  return output;
}

function summarizeBy(items, keyFn) {
  const summary = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!summary[key]) {
      summary[key] = { total: 0, passed: 0, failed: 0, averageScore: 0 };
    }
    summary[key].total += 1;
    summary[key].passed += item.passed ? 1 : 0;
    summary[key].failed += item.passed ? 0 : 1;
    summary[key].averageScore += item.score;
  }
  for (const item of Object.values(summary)) {
    item.averageScore = Math.round(item.averageScore / Math.max(1, item.total));
  }
  return summary;
}
