import { getModuleDefinition } from './modules.mjs';
import { loadKnowledgePack } from '../knowledge/loadKnowledge.mjs';

function formatObject(input) {
  return JSON.stringify(input || {}, null, 2);
}

function formatFacts(input = {}) {
  return Object.entries(input)
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}=${String(value).trim()}`)
    .join('；') || '用户未填写明确事实';
}

export async function buildPrompt({ moduleId, formData, selections, context }) {
  const definition = getModuleDefinition(moduleId);
  const knowledgePack = await loadKnowledgePack({
    taskType: definition.taskType,
    moduleId: definition.id,
    label: definition.label,
    knowledge: definition.knowledge,
    output: definition.output,
    formData,
    selections,
    context,
  });

  const system = [
    '你是一个中文 IP商业短视频顾问系统。',
    '你必须严格依据给定知识库方法论工作，不要输出泛泛建议。',
    '你必须输出完整骨架，不要输出最小版本。',
    '前端输入只是信息入口，不代表输出上限；即使用户只选择少量参数，也要按模块知识库补齐完整结构。',
    '如果信息不足，先在“待确认项”中列出，但仍要基于已有信息给出可执行初版。',
    '涉及产品功效、价格、资质、医疗健康、金融法律等内容时，必须提醒人工核验。',
  ].join('\n');

  const user = `
任务：${definition.label}
必须覆盖：${definition.output.join('、')}
用户事实清单（最高优先级，禁止忽略或改写）：${formatFacts(formData)}
用户输入：${formatObject(formData)}
前端选择：${formatObject(selections)}
继承上下文：${formatObject(context)}

精选知识包：
${knowledgePack.pack}

硬规则：
1. 前端选择是生成约束，subChoice 和 choices 都必须体现在结果里。
2. 必须结合知识包的方法和示例，不要泛泛写短视频建议。
3. 信息不足也要给可执行初版，并在 riskNotes 或 sections 中标出待确认项。
4. 禁止编造用户没有提供的团队人数、行业、城市、价格、案例、资质和结果。
5. 每个 sections、tables、scripts 都必须围绕用户事实清单里的行业、身份、产品/服务和承接方式。
6. 只输出 JSON，不要输出 Markdown。

JSON格式：
{"module":"${definition.label}","summary":"一句话总结","sections":[{"title":"区块标题","items":["要点1","要点2"]}],"tables":[{"title":"表格标题","columns":["列1","列2","列3"],"rows":[["内容1","内容2","内容3"]]}],"scripts":[{"title":"脚本标题","hook":"黄金3秒","body":["分段口播1","分段口播2"],"shots":["镜头建议"],"cta":"行动指令"}],"nextActions":["下一步动作"],"riskNotes":["核验提醒"]}
`;

  return { system, user, definition, knowledge: knowledgePack.selected };
}
