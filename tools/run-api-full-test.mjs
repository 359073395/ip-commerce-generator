import fs from 'node:fs/promises';
import path from 'node:path';

const endpoint = 'http://127.0.0.1:8790/api/generate';
const timeoutMs = Number(process.env.API_TEST_TIMEOUT_MS || 90000);
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('tools', 'api-test-results');
const jsonPath = path.join(outputDir, `api-generation-results-${stamp}.json`);
const mdPath = path.join(outputDir, `api-generation-results-${stamp}.md`);

const sharedBusiness = '杭州高端收纳整理师个人IP，服务新中产家庭和忙碌职场女性，主打全屋收纳规划、衣橱整理、搬家前整理，客单价2980-12800元，有真实前后对比案例、客户好评和8年从业经验，主要通过私信、表单、线上课程和预约咨询成交。';

const cases = [
  {
    id: 'ip-positioning',
    name: 'IP定位',
    formData: {
      industry: '家居装修',
      role: '专家/顾问',
      offer: '咨询服务',
      buyer: '职场人群',
      proof: '前后对比',
      contentCondition: '真人口播',
      conversion: '线上课程',
      details: sharedBusiness,
    },
    selections: [],
  },
  {
    id: 'viral-topics',
    name: '爆款选题',
    formData: { prompt: `${sharedBusiness} 需要生成适合短视频起号的爆款选题。` },
    selections: [{ step: '第二步：主脚本选择', choice: '教知识', subChoice: '案例型' }],
  },
  {
    id: 'conversion-topics',
    name: '成交选题',
    formData: { prompt: `${sharedBusiness} 目标是让用户愿意私信咨询和购买线上收纳课程。` },
    selections: [
      { step: '第二步：主脚本选择', choice: '晒过程', subChoice: '过程展示' },
      { step: '第三步：进店/成交理由选择', choices: ['效果好', '案例多', '服务好'] },
    ],
  },
  {
    id: 'pain-topics',
    name: '痛点选题',
    formData: {
      industryBackground: '我是做了8年的杭州高端收纳整理师，服务过200多个家庭，主打全屋收纳规划、衣橱整理和搬家前整理。',
      targetCustomer: '新中产家庭、忙碌职场女性、家里很乱但不知道怎么开始整理的人，以及想提升居住品质的人。',
    },
    selections: [],
  },
  {
    id: 'script',
    name: '脚本创作',
    formData: { prompt: `${sharedBusiness} 请生成一条60秒口播脚本，目标是让用户私信领取收纳清单，并预约咨询。` },
    selections: [
      { step: '第一步：主脚本选择', choice: '个人IP脚本' },
      { step: '第二步：继续选择', choice: '讲故事', subChoice: '客户案例' },
    ],
  },
  {
    id: 'rewrite',
    name: '文案二创',
    formData: {
      prompt: `原文案：你家不是东西太多，而是每个东西都没有固定位置。一个家真正变清爽，不是靠扔东西，而是靠动线和收纳系统。请改成更适合${sharedBusiness}的口播文案。`,
    },
    selections: [{ step: '第一步：二创方向', choice: '换人群' }],
  },
  {
    id: 'viral-analysis',
    name: '爆款拆解',
    formData: {
      prompt: `参考视频内容：一个收纳师展示客户家从凌乱到整洁的前后对比，开头说“你以为家乱是因为懒，其实是因为动线错了”。请拆解并迁移到${sharedBusiness}。`,
    },
    selections: [{ step: '第一步：拆解维度', choice: '成交链路拆解' }],
  },
  {
    id: 'polish',
    name: '文案洗稿',
    formData: {
      prompt: `原文案：很多人以为收纳就是买盒子，其实越买越乱。真正有效的收纳，是先判断生活动线，再给每个物品安排位置。请按${sharedBusiness}重写。`,
    },
    selections: [{ step: '第一步：洗稿方向', choice: '痛点重写' }],
  },
  {
    id: 'commerce',
    name: '带货',
    formData: {
      product: '线上收纳系统课，售价399元，包含衣橱整理、厨房整理、搬家整理和收纳工具清单',
      audience: '品质需求人群',
      scene: '解决痛点',
      sellingPoint: '效果',
      proof: '200个家庭整理案例、前后对比图、学员整理反馈、8年从业经验',
    },
    selections: [
      { step: '带货链路', choice: '产品需求' },
      { step: '成交入口', choice: '商品卡' },
    ],
  },
];

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function evaluateResult(moduleName, result) {
  const sections = Array.isArray(result?.sections) ? result.sections : [];
  const tables = Array.isArray(result?.tables) ? result.tables : [];
  const scripts = Array.isArray(result?.scripts) ? result.scripts : [];
  const nextActions = Array.isArray(result?.nextActions) ? result.nextActions : [];
  const riskNotes = Array.isArray(result?.riskNotes) ? result.riskNotes : [];
  const text = JSON.stringify(result || {});
  const checks = {
    hasSummary: Boolean(result?.summary && result.summary.length >= 10),
    hasSections: sections.length >= 1 && sections.some((section) => Array.isArray(section.items) && section.items.length >= 2),
    hasTables: tables.length >= 1 && tables.some((table) => Array.isArray(table.rows) && table.rows.length >= 1),
    hasActionPlan: nextActions.length >= 1,
    hasRiskNotes: riskNotes.length >= 1,
    usesBusinessInput: hasAny(text, ['收纳', '整理', '杭州', '课程', '私信', '家庭']),
    hasKnowledgeShape: hasAny(text, ['定位', '目标用户', '内容矩阵', '痛点', '成交', '脚本', 'CTA', '信任', '复盘', '爆款', '拍摄', '承接']),
    scriptUseful: moduleName.includes('脚本') || moduleName.includes('带货') ? scripts.length >= 1 : true,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  return { checks, passed: failed.length === 0, failed };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildSummary(results) {
  return {
    generatedAt: now.toISOString(),
    api: { baseUrl: 'https://api.hyjiexi.eu.org/v1', model: 'gpt-5.5', key: 'redacted' },
    total: results.length,
    passed: results.filter((item) => item.ok && item.evaluation?.passed).length,
    failed: results.filter((item) => !item.ok || !item.evaluation?.passed).length,
    modules: results.map((item) => ({
      id: item.id,
      name: item.name,
      ok: item.ok,
      passed: Boolean(item.evaluation?.passed),
      elapsedMs: item.elapsedMs,
      failedChecks: item.evaluation?.failed || (item.error ? ['generationError'] : []),
      error: item.error || null,
    })),
  };
}

function buildMarkdown(summary, results) {
  const md = [];
  md.push('# API 对接与全功能生成测试报告');
  md.push('');
  md.push(`- 生成时间：${summary.generatedAt}`);
  md.push('- Base URL：https://api.hyjiexi.eu.org/v1');
  md.push('- 模型：gpt-5.5');
  md.push('- API Key：已隐藏');
  md.push(`- 结果：${summary.passed}/${summary.total} 个模块通过自动质量检查`);
  md.push('');
  md.push('## 模块汇总');
  md.push('');
  md.push('| 模块 | 状态 | 耗时 | 未通过项 |');
  md.push('| --- | --- | ---: | --- |');
  for (const item of summary.modules) {
    md.push(`| ${item.name} | ${item.ok && item.passed ? '通过' : '需复查'} | ${(item.elapsedMs / 1000).toFixed(1)}s | ${item.failedChecks.join(', ') || '-'} |`);
  }
  md.push('');
  for (const item of results) {
    md.push(`## ${item.name}`);
    md.push('');
    if (!item.ok) {
      md.push(`生成失败：${item.error}`);
      md.push('');
      continue;
    }
    md.push(`自动检查：${item.evaluation.passed ? '通过' : `需复查：${item.evaluation.failed.join(', ')}`}`);
    md.push('');
    md.push('### 摘要');
    md.push(item.result.summary || '无摘要');
    md.push('');
    if (item.result.sections?.length) {
      md.push('### 结构区块');
      for (const section of item.result.sections) {
        md.push(`#### ${section.title}`);
        for (const point of section.items || []) md.push(`- ${point}`);
      }
      md.push('');
    }
    if (item.result.tables?.length) {
      md.push('### 表格');
      for (const table of item.result.tables) {
        md.push(`#### ${table.title}`);
        md.push(`列：${(table.columns || []).join(' / ')}`);
        for (const row of table.rows || []) md.push(`- ${(row || []).join(' | ')}`);
      }
      md.push('');
    }
    if (item.result.scripts?.length) {
      md.push('### 脚本');
      for (const script of item.result.scripts) {
        md.push(`#### ${script.title}`);
        md.push(`- 黄金3秒：${script.hook || ''}`);
        for (const line of script.body || []) md.push(`- ${line}`);
        if (script.shots?.length) md.push(`- 镜头：${script.shots.join('；')}`);
        md.push(`- CTA：${script.cta || ''}`);
      }
      md.push('');
    }
    if (item.result.nextActions?.length) {
      md.push('### 下一步动作');
      for (const action of item.result.nextActions) md.push(`- ${action}`);
      md.push('');
    }
    if (item.result.riskNotes?.length) {
      md.push('### 风险提醒');
      for (const note of item.result.riskNotes) md.push(`- ${note}`);
      md.push('');
    }
  }
  return md.join('\n');
}

async function persist(results) {
  const summary = buildSummary(results);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2), 'utf8');
  await fs.writeFile(mdPath, buildMarkdown(summary, results), 'utf8');
  return summary;
}

await fs.mkdir(outputDir, { recursive: true });

const results = [];
let ipPositioningContext = null;

for (const item of cases) {
  console.log(`START ${item.name}`);
  const startedAt = Date.now();
  const body = {
    moduleId: item.id,
    formData: item.formData,
    selections: item.selections,
    context: item.id === 'ip-positioning' ? {} : { ipPositioning: ipPositioningContext },
  };
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: false, message: text.slice(0, 1000) };
    }
    const elapsedMs = Date.now() - startedAt;
    if (!response.ok || !payload.ok) {
      results.push({ id: item.id, name: item.name, ok: false, elapsedMs, error: payload.message || `HTTP ${response.status}`, request: body });
      console.log(`FAIL ${item.name} ${elapsedMs}ms`);
      await persist(results);
      continue;
    }
    if (item.id === 'ip-positioning') ipPositioningContext = payload.result;
    const evaluation = evaluateResult(item.name, payload.result);
    results.push({ id: item.id, name: item.name, ok: true, elapsedMs, evaluation, request: body, result: payload.result });
    console.log(`${evaluation.passed ? 'PASS' : 'REVIEW'} ${item.name} ${elapsedMs}ms`);
    await persist(results);
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : error.message;
    results.push({ id: item.id, name: item.name, ok: false, elapsedMs, error: message, request: body });
    console.log(`ERROR ${item.name} ${message}`);
    await persist(results);
  }
}

const summary = await persist(results);
console.log(JSON.stringify({ summary, jsonPath, mdPath }, null, 2));
