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
  {
    query: '风险共担 前期不收费 要不回来分文不取',
    moduleId: 'conversion-topics',
    expectedBlockId: 'ip-deep-risk-shared-plain-offer',
  },
  {
    query: '是不是吾天律师 私信 电话咨询 高隐私',
    moduleId: 'conversion-topics',
    expectedBlockIds: ['ip-deep-silent-high-intent-conversion', 'ip-wutian-silent-high-intent-conversion'],
  },
  {
    query: '方言 江湖气 本地自己人 情绪强',
    moduleId: 'ip-positioning',
    expectedBlockId: 'ip-deep-local-real-person-emotion',
  },
  {
    query: '低粉爆款 评论准 开头狠 结构改编',
    moduleId: 'viral-topics',
    expectedBlockId: 'ip-deep-low-follower-viral-remix',
  },
  {
    query: '工厂老板 展厅 空间资产 B端询盘',
    moduleId: 'ip-positioning',
    expectedBlockId: 'ip-deep-factory-space-proof-tour',
  },
  {
    query: '选题排序 立人设 泛流量 信任证明 转化选题',
    moduleId: 'operation-plan',
    expectedBlockId: 'ip-topic-sequencing-content-layers',
  },
  {
    query: '流量型选题爆了 24小时紧跟转化类型视频',
    moduleId: 'operation-plan',
    expectedBlockId: 'ip-topic-sequencing-traffic-to-conversion-relay',
  },
  {
    query: '冷启动 增长期 转化期 选题比例 泛流量比例',
    moduleId: 'operation-plan',
    expectedBlockId: 'ip-topic-sequencing-stage-ratio',
  },
  {
    query: '账号阶段 冷启动 起量期 爆款后 运营规划',
    moduleId: 'operation-plan',
    expectedBlockId: 'ip-operation-stage-diagnosis',
  },
  {
    query: '7天发布日历 14天内容规划 选题排序 CTA复盘',
    moduleId: 'operation-plan',
    expectedBlockId: 'ip-operation-publishing-calendar',
  },
  {
    query: '播放高咨询低 评论准 私信高 每次只改一处',
    moduleId: 'operation-plan',
    expectedBlockId: 'ip-operation-data-review-loop',
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
  const expectedBlockIds = testCase.expectedBlockIds || [testCase.expectedBlockId];
  assert.ok(
    expectedBlockIds.some((blockId) => hits.includes(blockId)),
    `benchmark method retrieval should include one of ${expectedBlockIds.join(', ')} for ${testCase.query}`,
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
