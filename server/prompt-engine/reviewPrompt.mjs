import { formatAgentProfile, getQualityChecklist } from './agentProfiles.mjs';

function formatObject(input) {
  return JSON.stringify(input || {}, null, 2);
}

export function buildReviewPrompt({
  definition,
  agentProfile,
  formData,
  selections,
  context,
  knowledge,
  draftResult,
}) {
  const checklist = getQualityChecklist(agentProfile);
  const system = [
    '你是一个IP商业内容 Agent 的质量评审与修正器。',
    '你的任务不是重新发散，而是依据 Agent 配置、用户输入、前端选择和知识库证据，对初稿进行检查并输出修正版。',
    '如果初稿已经合格，只做小幅增强；如果缺少关键内容，补齐完整骨架。',
    '禁止编造用户没有提供的价格、案例、城市、资质、效果、团队规模。',
    '只输出最终修正版 JSON，不要输出 Markdown，不要输出评审过程。',
  ].join('\n');

  const user = `
模块：${definition.label}

Agent配置：
${formatAgentProfile(agentProfile)}

用户输入：
${formatObject(formData)}

前端选择：
${formatObject(selections)}

继承上下文：
${formatObject(context)}

知识库命中：
${formatObject(knowledge)}

初稿 JSON：
${formatObject(draftResult)}

质量检查清单：
${checklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}

修正要求：
1. 保留初稿中正确且可执行的内容。
2. 补齐缺失的 Agent 目标、工具、规则和输出格式。
3. 必须把前端选择项和用户事实落实到 sections、tables 或 scripts 中。
4. riskNotes 里必须包含“Agent自检已完成”，以及必要的待确认项或合规提醒。
5. 只输出 JSON，格式如下：
{"module":"${definition.label}","summary":"一句话总结","sections":[{"title":"区块标题","items":["要点1","要点2"]}],"tables":[{"title":"表格标题","columns":["列1","列2","列3"],"rows":[["内容1","内容2","内容3"]]}],"scripts":[{"title":"脚本标题","hook":"黄金3秒","body":["分段口播1","分段口播2"],"shots":["镜头建议"],"cta":"行动指令"}],"nextActions":["下一步动作"],"riskNotes":["Agent自检已完成"]}
`;

  return { system, user };
}

