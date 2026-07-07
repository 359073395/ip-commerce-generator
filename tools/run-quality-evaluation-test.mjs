import assert from 'node:assert/strict';
import { evaluateResultQuality } from '../server/quality/evaluateResultQuality.mjs';

const requestBody = {
  formData: {
    prompt: '本地美业老板IP，卖到店护理和团购券，目标用户是本地年轻女性，私信预约到店',
  },
  selections: [
    { step: '第一步：主脚本选择', choice: '成交脚本' },
    { step: '第二步：继续选择', choice: '痛点成交' },
  ],
  context: {
    projectProfile: {
      industry: '本地美业',
      persona: '老板IP',
      offer: '到店护理和团购券',
      audience: '本地年轻女性',
      conversion: '私信预约到店',
    },
  },
};

const strongResult = {
  module: '脚本创作',
  summary: '为本地美业老板IP生成一条围绕年轻女性到店护理痛点成交的短视频脚本。',
  sections: [
    { title: '定位承接', items: ['本地美业老板IP', '目标用户是本地年轻女性', '承接方式是私信预约到店'] },
    { title: '痛点成交逻辑', items: ['用痛点成交切入', '先讲护理误区，再给到店解决方案'] },
  ],
  tables: [
    { title: '拍摄表', columns: ['镜头', '内容'], rows: [['开头', '黄金3秒说出痛点'], ['结尾', 'CTA引导私信预约']] },
  ],
  scripts: [
    {
      title: '成交脚本：皮肤越护越差',
      hook: '很多本地年轻女性不是不护肤，是第一步就做错了。',
      body: ['我是本地美业老板IP，今天讲一个到店护理前必须知道的误区。', '如果你也想少走弯路，可以先做一次基础检测。'],
      shots: ['门店检测镜头', '前后对比素材'],
      cta: '评论“护理”，私信预约到店。',
    },
  ],
  nextActions: ['拍摄门店检测镜头', '准备客户评价和前后对比素材'],
  riskNotes: ['案例和效果需要人工核验，避免夸大承诺。'],
};

const strongQuality = evaluateResultQuality({
  result: strongResult,
  definition: { id: 'script' },
  knowledge: [
    { heading: '7. 四类脚本卡', matchedTerms: ['脚本', '黄金3秒', 'CTA'] },
    { heading: '成交链路', matchedTerms: ['痛点成交', '成交脚本'] },
  ],
  requestBody,
});

assert.ok(strongQuality.score >= 85, `strong result should score high, got ${strongQuality.score}`);
assert.equal(strongQuality.level, 'excellent');
assert.ok(strongQuality.checks.every((item) => item.id && typeof item.score === 'number'));

const weakQuality = evaluateResultQuality({
  result: { summary: '给你一些建议。', sections: [], tables: [], scripts: [], nextActions: [], riskNotes: [] },
  definition: { id: 'script' },
  knowledge: [{ heading: '四类脚本卡', matchedTerms: ['脚本'] }],
  requestBody,
});

assert.ok(weakQuality.score < 70, `weak result should need review, got ${weakQuality.score}`);
assert.equal(weakQuality.level, 'needs_review');
assert.ok(weakQuality.missing.includes('完整骨架'));
assert.ok(weakQuality.missing.includes('风险提醒'));

const noRiskQuality = evaluateResultQuality({
  result: { ...strongResult, riskNotes: [] },
  definition: { id: 'script' },
  knowledge: [{ heading: '四类脚本卡', matchedTerms: ['脚本', 'CTA'] }],
  requestBody,
});

assert.ok(noRiskQuality.score < strongQuality.score, 'missing risk notes should lower the score');

console.log(JSON.stringify({
  ok: true,
  strongScore: strongQuality.score,
  weakScore: weakQuality.score,
  noRiskScore: noRiskQuality.score,
  message: 'Quality evaluation tests passed.',
}, null, 2));
