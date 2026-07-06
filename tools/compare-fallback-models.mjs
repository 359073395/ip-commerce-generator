import { buildPrompt } from '../server/prompt-engine/buildPrompt.mjs';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.hyjiexi.eu.org/v1';
const models = (process.env.COMPARE_MODELS || 'gpt-5.4,gpt-5.4-mini,gemini-3-flash')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required');
}

const { system, user } = await buildPrompt({
  moduleId: 'ip-positioning',
  formData: {
    industry: '家居装修',
    role: '专家/顾问',
    offer: '线上课程',
    buyer: '职场人群',
    proof: '前后对比',
    contentCondition: '真人口播',
    conversion: '线上课程',
    details: '杭州高端收纳整理师个人IP，服务新中产家庭和忙碌职场女性，主打全屋收纳规划、衣橱整理、搬家前整理，客单价2980-12800元，有真实前后对比案例、客户好评和8年从业经验，主要通过私信、表单、线上课程和预约咨询成交。',
  },
  selections: [],
  context: {},
});

function evaluate(content) {
  const checks = {
    json: false,
    hangzhou: content.includes('杭州'),
    organizer: content.includes('收纳') || content.includes('整理'),
    course: content.includes('课程'),
    conversion: content.includes('私信') || content.includes('表单') || content.includes('预约'),
    noMojibake: !content.includes('乱码') && !content.includes('????'),
    noFakeTeam: !content.includes('8人团队') && !content.includes('8人'),
    hasScript: content.includes('hook') || content.includes('黄金3秒') || content.includes('脚本'),
    hasTable: content.includes('tables') || content.includes('表格') || content.includes('columns'),
  };
  try {
    const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    checks.json = Boolean(parsed.summary || parsed.sections);
  } catch {
    checks.json = false;
  }
  return { score: Object.values(checks).filter(Boolean).length, checks };
}

for (const model of models) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 1200,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || '';
    console.log(JSON.stringify({
      model,
      status: response.status,
      elapsedMs: Date.now() - started,
      ...evaluate(content),
      preview: content.slice(0, 500),
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      model,
      elapsedMs: Date.now() - started,
      error: error.name === 'AbortError' ? 'timeout' : error.message,
    }, null, 2));
  } finally {
    clearTimeout(timer);
  }
}
