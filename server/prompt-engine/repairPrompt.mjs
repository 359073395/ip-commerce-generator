function formatObject(input) {
  return JSON.stringify(input || {}, null, 2);
}

export function buildQualityRepairPrompt({
  definition,
  formData,
  selections,
  context,
  knowledge,
  currentResult,
  quality,
} = {}) {
  const system = [
    '你是 IP 商业内容 Agent 的质量修复器。',
    '你的任务是基于原始用户事实、前端选择、项目档案和知识库命中，修复一份低质量 JSON 结果。',
    '不要重新发散，不要编造用户没有提供的城市、价格、案例、资质、疗效或结果。',
    '必须补齐完整骨架、可执行步骤、必要表格/脚本、CTA 和风险提醒。',
    '只输出最终修复后的 JSON，不要输出 Markdown，也不要解释修复过程。',
  ].join('\n');

  const user = `
模块：${definition?.label || definition?.id || '未知模块'}

用户输入：
${formatObject(formData)}

前端选择：
${formatObject(selections)}

继承上下文：
${formatObject(context)}

知识库命中：
${formatObject(knowledge)}

当前质量评估：
${formatObject(quality)}

当前结果：
${formatObject(currentResult)}

修复要求：
1. 针对 quality.missing 逐项补齐，不要只改 summary。
2. 必须体现用户输入和前端选择，尤其是 choice/subChoice/choices。
3. 必须结合知识库命中的方法词，例如脚本卡、黄金3秒、成交链路、CTA、痛点或带货承接。
4. 如果信息不足，写出待确认项，但仍给出可执行初版。
5. riskNotes 至少包含一条人工核验或待确认提醒。
6. 输出 JSON 格式：
{"module":"${definition?.label || '模块结果'}","summary":"一句话总结","sections":[{"title":"区块标题","items":["要点1","要点2"]}],"tables":[{"title":"表格标题","columns":["列1","列2","列3"],"rows":[["内容1","内容2","内容3"]]}],"scripts":[{"title":"脚本标题","hook":"黄金3秒","body":["分段口播1","分段口播2"],"shots":["镜头建议"],"cta":"行动指令"}],"nextActions":["下一步动作"],"riskNotes":["核验提醒"]}
`;

  return { system, user };
}
