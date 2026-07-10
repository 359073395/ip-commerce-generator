import assert from 'node:assert/strict';
import { loadKnowledgePack } from '../server/knowledge/loadKnowledge.mjs';

const scriptPack = await loadKnowledgePack({
  taskType: 'combined',
  moduleId: 'script',
  label: '脚本创作',
  knowledge: ['4P原则', '八大爆款元素', '黄金3秒'],
  output: ['完整脚本', 'CTA', '分镜'],
  formData: {
    prompt: '本地美业老板IP，做成交脚本，要体现痛点、案例、黄金3秒和CTA',
  },
  selections: [
    { step: '第一步：主脚本选择', choice: '成交脚本' },
    { step: '第二步：继续选择', choice: '痛点成交' },
  ],
  context: {
    agentGoal: '先定位，再做成交选题，最后生成完整短视频脚本',
  },
  budgetChars: 1400,
});

assert.ok(scriptPack.queryTerms.includes('八大爆款元素'), 'script query terms should include module-specific viral elements');
assert.ok(scriptPack.selected.length >= 3, 'script retrieval should select multiple sections');
assert.ok(scriptPack.selected.some((item) => /脚本|黄金3秒|CTA|爆款/.test(`${item.heading} ${item.matchedTerms?.join(' ')}`)), 'script retrieval should hit script/viral/CTA knowledge');
assert.ok(scriptPack.selected.every((item) => Array.isArray(item.matchedTerms)), 'selected sections should include matched terms');
assert.ok(scriptPack.retrieval.selectedSources.length >= 1, 'retrieval metadata should include selected sources');

const commercePack = await loadKnowledgePack({
  taskType: 'commerce_video',
  moduleId: 'commerce',
  label: '带货',
  knowledge: ['带货视频', '成交心理链路', '商品卡', '小黄车'],
  output: ['成交理由', '带货脚本', '商品视觉化'],
  formData: {
    product: 'TikTok Shop 清洁产品',
    audience: '跨境消费者',
    proof: '用户评价和测评素材',
  },
  selections: [{ step: '成交入口', choice: '商品卡' }],
  budgetChars: 1200,
});

assert.ok(commercePack.selected.some((item) => item.source === 'handbooks/commerce-video.md'), 'commerce retrieval should use commerce handbook');
assert.ok(commercePack.selected.some((item) => /带货|成交|商品|小黄车|TikTok/.test(`${item.heading} ${item.matchedTerms?.join(' ')}`)), 'commerce retrieval should hit commerce terms');

const combinedPack = await loadKnowledgePack({
  taskType: 'combined',
  moduleId: 'conversion-topics',
  label: '成交选题',
  knowledge: ['个人IP', '成交理由', '私域承接'],
  output: ['成交型选题', '信任证明', 'CTA'],
  formData: {
    prompt: '本地美业老板IP，卖到店护理和团购券，私信预约到店',
  },
  selections: [{ step: '第三步：进店/成交理由选择', choices: ['效果好', '好评多', '案例多'] }],
  budgetChars: 1600,
});

assert.ok(combinedPack.retrieval.selectedSources.length >= 2, 'combined retrieval should keep source diversity when budget allows');
assert.ok(combinedPack.selected.some((item) => /成交|承接|CTA|私域/.test(`${item.heading} ${item.matchedTerms?.join(' ')}`)), 'combined retrieval should hit conversion knowledge');

const benchmarkMethodCases = [
  {
    query: '第一视角 忙碌 业绩 美甲',
    moduleId: 'script',
    expectedBlockId: 'ip-video-method-first-person-busy-proof',
  },
  {
    query: '抓路人 前后对比 素人改造',
    moduleId: 'viral-analysis',
    expectedBlockId: 'ip-video-method-street-transformation-proof',
  },
  {
    query: '装修 你就这么问 导购',
    moduleId: 'script',
    expectedBlockId: 'ip-video-method-domain-question-template',
  },
  {
    query: '七位数 展厅 工厂',
    moduleId: 'ip-positioning',
    expectedBlockId: 'ip-video-method-proof-asset-frontload',
  },
  {
    query: '工程律师 执行回款 团队证据',
    moduleId: 'conversion-topics',
    expectedBlockId: 'ip-benchmark-lawyer-professional-judgment',
  },
];

const benchmarkMethodHits = [];
for (const testCase of benchmarkMethodCases) {
  const pack = await loadKnowledgePack({
    taskType: 'combined',
    moduleId: testCase.moduleId,
    label: testCase.query,
    knowledge: testCase.query.split(' '),
    formData: { prompt: testCase.query },
    budgetChars: 1600,
  });
  const hits = pack.selected
    .filter((item) => item.source?.startsWith('structured-blocks/'))
    .map((item) => item.source.replace('structured-blocks/', ''));
  benchmarkMethodHits.push({ query: testCase.query, hits: hits.slice(0, 6) });
  assert.ok(
    hits.includes(testCase.expectedBlockId),
    `benchmark method retrieval should include ${testCase.expectedBlockId} for ${testCase.query}`,
  );
}

console.log(JSON.stringify({
  ok: true,
  scriptSelected: scriptPack.selected.map((item) => `${item.source} > ${item.heading}`),
  commerceSelected: commercePack.selected.map((item) => `${item.source} > ${item.heading}`),
  combinedSources: combinedPack.retrieval.selectedSources,
  benchmarkMethodHits,
  message: 'Knowledge retrieval tests passed.',
}, null, 2));
