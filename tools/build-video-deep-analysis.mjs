import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const evidenceDir = path.join(root, 'outputs', 'account_video_deep_analysis', 'video_page_evidence');
const outDir = path.join(root, 'outputs', 'account_video_deep_analysis');
const structuredPath = path.join(root, 'knowledge', 'structured-blocks.json');

const groupOrder = [
  '本地美业/同城流量',
  '本地美业/美甲店',
  '变美技术/眉毛',
  '美业账号诊断',
  '美学主理人',
  '高审美生活方式',
  '短视频课程',
  'AI商业课程',
  '企业流量增长',
  '电商管理咨询',
  '成交文案课程',
  '广告认知',
  '商业认知老板圈',
  '商业咨询头部',
  '装修避坑',
  '装修内幕',
  '装修公司流程',
  '装修日记',
  '宠物医院',
  '宠物测评',
  '工程律师难案',
  '工程律师团队',
  'AI跨境服务商',
  '变美闺蜜',
  '比例美学专家',
  '电气工厂老板',
  '家居定制工厂',
];

const videoMethodBlocks = [
  {
    id: 'ip-video-method-cross-scene-reversal',
    category: 'personal_ip',
    moduleIds: ['viral-analysis', 'viral-topics', 'script', 'rewrite'],
    title: '视频方法：跨场景反差钩子',
    methods: ['行业人进入陌生场景', '反差制造停留', '评论区争议', '把争议转成专业观点'],
    scenarios: ['美业IP', '实体老板IP', '本地服务IP', '冷启动爆款'],
    requiredInputs: ['行业身份', '陌生场景', '观众误解点', '可回扣的专业观点', '转化入口'],
    outputTemplate: ['反差第一句', '陌生场景动作', '观众争议', '行业洞察', '回到产品/方法'],
    example: '“当美业人去摆摊卖菜”不是为了真的卖菜，而是用美业和摆摊的冲突，让评论区讨论引流、客单价、利润，再回扣美业同城获客。',
    keywords: ['跨场景', '反差', '摆摊', '争议', '引流', '实体老板', '冷启动爆款']
  },
  {
    id: 'ip-video-method-first-person-busy-proof',
    category: 'personal_ip',
    moduleIds: ['script', 'viral-analysis', 'conversion-topics'],
    title: '视频方法：第一视角忙碌证明',
    methods: ['第一视角', '忙碌过程', '客单价外显', '顾客互动', '团队日常', '招聘吸引'],
    scenarios: ['美甲美睫', '本地门店', '服务业老板IP', '招聘型账号'],
    requiredInputs: ['服务过程', '客户预约或排队', '客单价信号', '顾客反馈', '团队状态'],
    outputTemplate: ['忙碌开场', '连续服务动作', '客户关系细节', '客单价/业绩提示', '预约或招聘CTA'],
    example: '“美甲店超忙碌，业绩大爆炸的一天”用第一视角把客流、服务动作、顾客治愈和千元美甲拍成证据。',
    keywords: ['第一视角', '忙碌', '业绩大爆炸', '千元美甲', '顾客', '工作日常', '招聘']
  },
  {
    id: 'ip-video-method-street-transformation-proof',
    category: 'personal_ip',
    moduleIds: ['viral-analysis', 'script', 'viral-topics'],
    title: '视频方法：街头素人改造证明',
    methods: ['抓路人', '前后对比', '第N天连续栏目', '陌生人即时反应', '结果纯享'],
    scenarios: ['变美IP', '技术服务IP', '线下课程', '审美服务'],
    requiredInputs: ['可改造对象', '改造前痛点', '改造过程', '改造后反应', '课程或服务入口'],
    outputTemplate: ['问题脸/问题眉开场', '快速授权/坐下', '过程压缩', '结果对比', '用户反应', '课程CTA'],
    example: '“在成都街头抓路人改眉毛第52天”把技术实力从自夸变成陌生人可见变化。',
    keywords: ['街头', '抓路人', '素人改造', '前后对比', '变装', '第N天', '男士眉']
  },
  {
    id: 'ip-video-method-strong-viewpoint-filter',
    category: 'personal_ip',
    moduleIds: ['viral-topics', 'script', 'conversion-topics'],
    title: '视频方法：强观点筛选高意向用户',
    methods: ['反常识判断', '老板痛点', '筛选不合适用户', '私域关键词', '资料领取'],
    scenarios: ['课程IP', '咨询IP', '企业服务IP', '老板IP'],
    requiredInputs: ['目标用户', '常见错误认知', '反常识观点', '案例或结果', '私信关键词'],
    outputTemplate: ['强观点第一句', '为什么多数人错', '真实案例', '方法框架', '关键词CTA'],
    example: '“管理者一定要闲，你如果忙，证明你错了”用一句反常识筛出真正关心管理的老板。',
    keywords: ['强观点', '反常识', '老板', '管理者一定要闲', '私信关键词', '课程IP', '咨询']
  },
  {
    id: 'ip-video-method-risk-checklist-save',
    category: 'combined',
    moduleIds: ['pain-topics', 'viral-topics', 'script', 'commerce'],
    title: '视频方法：风险清单收藏型内容',
    methods: ['数字清单', '避坑', '错误后果', '验收标准', '预算建议', '收藏驱动'],
    scenarios: ['装修IP', '宠物IP', '测评IP', '高风险消费决策'],
    requiredInputs: ['具体场景', '风险列表', '错误后果', '正确标准', '用户行动'],
    outputTemplate: ['场景点名', '数字清单', '每条风险后果', '正确做法', '评论/收藏CTA'],
    example: '“厨房装修记住十条小细节”“夏天慢性虐猫6个行为”“猫粮一句话总结”都在替用户降低犯错成本。',
    keywords: ['数字清单', '避坑', '风险', '收藏', '装修', '宠物', '猫粮', '狗粮', '验收']
  },
  {
    id: 'ip-video-method-proof-asset-frontload',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'script', 'conversion-topics', 'viral-analysis'],
    title: '视频方法：高价值资产前置',
    methods: ['金额/规模前置', '团队证据', '展厅工厂', '办案区域', '结果证明', '老板投入'],
    scenarios: ['工程律师IP', '工厂老板IP', 'B端服务IP', '高客单专业服务'],
    requiredInputs: ['金额或规模', '强证据资产', '目标客户痛点', '服务结果', '咨询入口'],
    outputTemplate: ['第一句高价值信号', '为什么难/为什么强', '现场证据', '结果证明', '合作/咨询CTA'],
    example: '“我花了七位数把电器城搬到展厅”“5000㎡实景展厅”“为什么全国工程老板找我们执行工程款”都把信任资产放到最前面。',
    keywords: ['高价值资产', '金额前置', '七位数', '2亿工厂', '5000㎡', '团队', '执行回款', '展厅']
  },
  {
    id: 'ip-video-method-identity-growth-story',
    category: 'personal_ip',
    moduleIds: ['script', 'viral-topics', 'viral-analysis'],
    title: '视频方法：身份成长故事',
    methods: ['人生节点', '挫折到结果', '团队/学员感谢', '使命感', '自我证明'],
    scenarios: ['创始人IP', '课程IP', '美业老师IP', '老板IP'],
    requiredInputs: ['过去困境', '关键转折', '具体成果', '帮助他人结果', '价值观'],
    outputTemplate: ['人生节点开场', '过去困境', '转折动作', '结果证明', '感谢/使命', '行动召唤'],
    example: '“敬自己”“十年商业路”“一场车祸把我撞醒”这类视频不是直接卖课，而是先让用户相信这个人有真实来路和使命。',
    keywords: ['成长故事', '敬自己', '十年商业路', '车祸', '使命', '创始人', '真实来路']
  },
  {
    id: 'ip-video-method-domain-question-template',
    category: 'personal_ip',
    moduleIds: ['script', 'viral-topics', 'pain-topics'],
    title: '视频方法：你就这么问模板',
    methods: ['替用户提问', '导购/专家话术', '选择标准', '避坑问题', '低门槛执行'],
    scenarios: ['装修建材', '高决策产品', '咨询服务', '测评账号'],
    requiredInputs: ['购买场景', '用户不会问的问题', '商家容易忽悠点', '正确提问句式', '判断标准'],
    outputTemplate: ['买X时别这样问', '你就这么问', '对方回答怎么判断', '避坑提醒', '收藏CTA'],
    example: '“你买冰箱/智能锁/瓷砖就这么问导购”把专业判断变成用户能直接复制的一句话。',
    keywords: ['你就这么问', '导购', '选择标准', '装修', '建材', '避坑', '提问模板']
  }
];

function parseNumberMetric(text = '') {
  const match = String(text).match(/(\d+(?:\.\d+)?)(万)?/);
  if (!match) return 0;
  return Number(match[1]) * (match[2] ? 10000 : 1);
}

function getDuration(page = {}) {
  const duration = page.videos?.find((item) => item.duration)?.duration || 0;
  if (duration) return Math.round(duration);
  const timeLine = page.textLines?.find((line) => /\d{2}:\d{2}\s*\/\s*\d{2}:\d{2}/.test(line));
  const match = timeLine?.match(/\/\s*(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function extractPublishDate(lines = []) {
  return lines.find((line) => line.startsWith('发布时间：'))?.replace('发布时间：', '') || '';
}

function extractEngagement(lines = [], title = '') {
  const idx = lines.findIndex((line) => line.includes(title.slice(0, Math.min(16, title.length))));
  const numberLines = lines
    .slice(idx >= 0 ? idx + 1 : 0)
    .filter((line) => /^(\d+(\.\d+)?万?|-)$/.test(line))
    .slice(0, 4);
  return {
    visibleNumbers: numberLines,
    primaryMetric: numberLines[0] || '',
  };
}

function extractChapter(lines = []) {
  const start = lines.findIndex((line) => line === '章节要点' || line.includes('章节要点'));
  if (start < 0) return [];
  const end = lines.findIndex((line, idx) => idx > start && line.includes('内容由AI生成'));
  return lines.slice(start + 1, end > start ? end : start + 20).filter((line) => !/^\d{2}:\d{2}$/.test(line)).slice(0, 24);
}

function extractComments(lines = []) {
  const start = lines.findIndex((line) => line === '全部评论');
  if (start < 0) return [];
  const stopWords = new Set(['留下你的精彩评论吧', '大家都在搜：', '分享', '回复', '举报', '展开', '加载中']);
  return lines
    .slice(start + 1)
    .filter((line) => line && !stopWords.has(line) && !line.startsWith('展开') && !/^\d+(\.\d+)?万?$/.test(line) && !/^\d+年前|^\d+月前|^\d+天前|^\d+小时前/.test(line))
    .slice(0, 18);
}

function inferHook(title, chapter, comments) {
  const hay = `${title}\n${chapter.join('\n')}\n${comments.join('\n')}`;
  const hooks = [];
  if (/第一视角|工作日常|忙碌|业绩|千元/.test(hay)) hooks.push('第一视角忙碌证明');
  if (/抓路人|素人|前后对比|变装|换头|爆改|捏成/.test(hay)) hooks.push('改造结果前置');
  if (/为什么|不是|而是|一定|证明你错了|最怕|别|不要|谨防/.test(hay)) hooks.push('反常识/风险钩子');
  if (/十条|8个|6个|十大|一句话总结|清单|盘点/.test(hay)) hooks.push('数字清单收藏钩子');
  if (/七位数|2亿|5000|1000|工程款|执行回款|团队|身价十亿/.test(hay)) hooks.push('高价值资产前置');
  if (/敬自己|十年|车祸|经历|一路|使命|创业故事|人生/.test(hay)) hooks.push('身份成长故事');
  if (/导购|就这么问|怎么选|验收/.test(hay)) hooks.push('替用户提问模板');
  if (/摆摊|卖菜|跨越|米兰|房车|奥运/.test(hay)) hooks.push('跨场景反差');
  return hooks.length ? hooks : ['标题场景直给'];
}

function inferStructure(title, group, chapter) {
  const hay = `${title}\n${chapter.join('\n')}`;
  if (/第一视角|工作日常|忙碌|团建/.test(hay)) return '真实日常：第一视角开场 -> 连续动作证明 -> 人物/顾客关系 -> 结果或情绪 -> 预约/招聘承接';
  if (/抓路人|素人|前后对比|爆改|捏成/.test(hay)) return '改造证明：问题对象 -> 过程压缩 -> 结果对比 -> 当事人反应 -> 服务/课程承接';
  if (/装修|瓷砖|厨房|水电|导购|验收|增项/.test(hay)) return '避坑清单：具体空间/产品 -> 数字清单或问题句 -> 错误后果 -> 正确标准 -> 收藏/咨询';
  if (/猫|狗|猫粮|狗粮|养宠/.test(hay)) return '风险测评：错误行为/产品选择 -> 后果风险 -> 标准解释 -> 预算/推荐 -> 评论/商品承接';
  if (/工程|工程款|律师|回款|打官司/.test(hay)) return '专业服务：行业现实 -> 客户困境 -> 专业判断/团队证据 -> 结果/路径 -> 电话/私信咨询';
  if (/工厂|展厅|全屋定制|电气|断路器/.test(hay)) return '工厂资产：规模金额开场 -> 现场证据 -> 产品线/能力 -> 老板投入 -> 询盘/直播承接';
  if (/商业|老板|管理|赚钱|AI|流量|文案|认知/.test(hay) || /课程|咨询/.test(group)) return '观点课程：强判断 -> 解释为什么 -> 案例/经历证明 -> 方法框架 -> 私域/课程承接';
  return '人设故事：身份/场景开场 -> 经历或观点 -> 证据 -> 情绪共鸣 -> 关注/咨询';
}

function inferVisual(title, group, page) {
  const hay = `${title}\n${group}`;
  const duration = getDuration(page);
  const visuals = [];
  if (/第一视角|工作日常|美甲|顾客/.test(hay)) visuals.push('手部/店内第一视角、顾客互动、服务连续动作');
  if (/抓路人|男士眉|素人|爆改|捏成|面部/.test(hay)) visuals.push('人脸近景、前后对比、改造结果封面');
  if (/装修|厨房|水电|瓷砖|导购|验收/.test(hay)) visuals.push('空间现场、材料/细节特写、黄色大字提示');
  if (/猫|狗|猫粮|狗粮|宠物/.test(hay)) visuals.push('宠物主体、产品包装、测评榜单或风险提示大字');
  if (/工程|律师|律所|团队/.test(hay)) visuals.push('律师口播、团队/律所/文件/案件证据');
  if (/工厂|展厅|电气|全屋定制/.test(hay)) visuals.push('工厂、展厅、产品线、老板出镜');
  if (/商业|AI|文案|认知|老板|管理/.test(hay)) visuals.push('人物口播、大字观点、课堂/直播/白板场景');
  if (!visuals.length) visuals.push('人物或场景封面，需结合视频画面复核');
  return `${visuals.join('；')}。时长约${duration || '未知'}秒。`;
}

function inferConversion(title, group, comments, chapter) {
  const hay = `${title}\n${group}\n${comments.join('\n')}\n${chapter.join('\n')}`;
  const signals = [];
  if (/私信|资料|666|进群|课程|学员|开课|峰会|培训/.test(hay)) signals.push('私信/资料/课程承接');
  if (/到店|预约|美甲|美业|团购|护理/.test(hay)) signals.push('到店/预约承接');
  if (/电话|工程|律师|回款|执行|案件/.test(hay)) signals.push('电话/私信咨询承接');
  if (/直播|商品|猫粮|狗粮|测评|618|offer/.test(hay)) signals.push('直播/商品/测评带货承接');
  if (/工厂|展厅|代工|全屋定制|东南亚|TikTok|SaaS/.test(hay)) signals.push('B端询盘/合作承接');
  return signals.length ? signals : ['关注/评论/私域承接待确认'];
}

function reusableFormula(hooks, structure) {
  if (hooks.includes('第一视角忙碌证明')) return '用第一视角拍一天，把“忙、贵、客户喜欢、团队真实”拍成信任证据。';
  if (hooks.includes('改造结果前置')) return '先抛出改造结果想象，再给前后对比和用户反应，最后承接服务或课程。';
  if (hooks.includes('数字清单收藏钩子')) return '把复杂决策拆成数字清单，让用户觉得收藏就能少踩坑。';
  if (hooks.includes('高价值资产前置')) return '第一句先抛金额/规模/团队/结果，再解释为什么这代表能力。';
  if (hooks.includes('身份成长故事')) return '用人生节点证明这个人真实、有来路、有使命，再承接课程/咨询。';
  if (hooks.includes('替用户提问模板')) return '把专家判断变成用户下一次就能问出口的一句话。';
  if (hooks.includes('跨场景反差')) return '让行业身份进入不相关场景，用冲突制造讨论，再回扣专业观点。';
  if (hooks.includes('反常识/风险钩子')) return '先说一个违背直觉的判断，再解释背后的损失和正确做法。';
  return structure;
}

async function readEvidence() {
  const files = (await fs.readdir(evidenceDir)).filter((file) => file.endsWith('.json')).sort();
  const rows = [];
  for (const file of files) {
    const item = JSON.parse((await fs.readFile(path.join(evidenceDir, file), 'utf8')).replace(/^\uFEFF/, ''));
    if (!item.ok) {
      rows.push({
        index: item.index,
        ok: false,
        accountId: item.candidate?.accountId,
        accountName: item.candidate?.accountName,
        group: item.candidate?.group,
        title: item.candidate?.title,
        url: item.candidate?.url,
        error: item.error,
      });
      continue;
    }
    const { candidate, page } = item;
    const lines = page.textLines || [];
    const chapter = extractChapter(lines);
    const comments = extractComments(lines);
    const hooks = inferHook(candidate.title, chapter, comments);
    const structure = inferStructure(candidate.title, candidate.group, chapter);
    const visual = inferVisual(candidate.title, candidate.group, page);
    rows.push({
      index: item.index,
      ok: true,
      accountId: candidate.accountId,
      accountName: candidate.accountName,
      group: candidate.group,
      rank: candidate.rank,
      title: candidate.title,
      url: candidate.url,
      metricText: candidate.metricText,
      metricValue: candidate.metricValue,
      pinned: candidate.pinned,
      score: candidate.score,
      publishDate: extractPublishDate(lines),
      durationSec: getDuration(page),
      pageTitle: page.title,
      description: page.description,
      keywords: page.keywords,
      cover: page.cover,
      hasChapterSummary: page.hasChapterSummary,
      chapterEvidence: chapter,
      commentEvidence: comments,
      engagement: extractEngagement(lines, candidate.title),
      hookMechanics: hooks,
      structureFormula: structure,
      visualGrammar: visual,
      conversionSignals: inferConversion(candidate.title, candidate.group, comments, chapter),
      reusableFormula: reusableFormula(hooks, structure),
      evidenceLevel: page.hasChapterSummary ? '标题+页面文本+平台章节摘要+评论片段' : '标题+页面文本+评论片段/封面；无逐字稿',
    });
  }
  return rows;
}

function groupSummary(rows) {
  const groups = new Map();
  for (const row of rows.filter((item) => item.ok)) {
    const item = groups.get(row.group) || {
      group: row.group,
      accounts: new Set(),
      videos: 0,
      chapterCount: 0,
      topHooks: new Map(),
      formulas: new Set(),
      topVideos: [],
    };
    item.accounts.add(`${row.accountId} ${row.accountName}`);
    item.videos += 1;
    if (row.hasChapterSummary) item.chapterCount += 1;
    for (const hook of row.hookMechanics) item.topHooks.set(hook, (item.topHooks.get(hook) || 0) + 1);
    item.formulas.add(row.reusableFormula);
    item.topVideos.push(row);
    groups.set(row.group, item);
  }
  return [...groups.values()]
    .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group))
    .map((item) => ({
      group: item.group,
      accounts: [...item.accounts],
      videos: item.videos,
      chapterCount: item.chapterCount,
      topHooks: [...item.topHooks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([hook, count]) => `${hook}(${count})`),
      coreFormulas: [...item.formulas].slice(0, 5),
      representativeVideos: item.topVideos.sort((a, b) => b.metricValue - a.metricValue).slice(0, 3).map((row) => `${row.accountId}｜${row.metricText}｜${row.title}`),
    }));
}

function toMarkdown(rows, summaries) {
  const lines = [
    '# 对标账号视频级深拆报告',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 完成范围',
    '',
    `- 深拆视频：${rows.length} 条`,
    `- 成功读取：${rows.filter((row) => row.ok).length} 条`,
    `- 有平台章节摘要：${rows.filter((row) => row.ok && row.hasChapterSummary).length} 条`,
    '- 说明：页面未提供逐字稿的视频，不编造原话；只使用标题、页面可见文本、平台章节摘要、评论片段和封面/时长证据。',
    '',
    '## 总结',
    '',
    '- 个人IP起量不是靠“前端好看”，而是把身份、证据、场景、痛点、结果和转化入口压进第一句话和第一屏。',
    '- 所有行业都在复用同一条底层链路：先制造注意力，再证明可信，再让用户看到自己，再给一个低阻力承接动作。',
    '- 吾天账号的工程律师逻辑可以继续扩展：案件金额/强对手/客户困境/风险共担，是“高价值资产前置”的工程行业版本。',
    '- 其他行业补强了方法库：第一视角忙碌证明、街头素人改造、数字清单收藏、强观点筛选、工厂资产炫富、你就这么问模板。',
    '',
    '## 行业视频方法总结',
    '',
  ];
  for (const summary of summaries) {
    lines.push(`### ${summary.group}`, '');
    lines.push(`- 视频数：${summary.videos}，含章节摘要：${summary.chapterCount}`);
    lines.push(`- 账号：${summary.accounts.join('、')}`);
    lines.push(`- 高频钩子：${summary.topHooks.join('、')}`);
    lines.push(`- 可复用公式：${summary.coreFormulas.join('；')}`);
    lines.push(`- 代表视频：${summary.representativeVideos.join('；')}`);
    lines.push('');
  }
  lines.push('## 逐条视频拆解', '');
  for (const row of rows) {
    lines.push(`### ${String(row.index).padStart(3, '0')} ${row.accountId}｜${row.accountName}`);
    lines.push('');
    lines.push(`- 标题：${row.title}`);
    lines.push(`- 链接：${row.url}`);
    lines.push(`- 数据：${row.pinned ? '置顶，' : ''}${row.metricText || '-'}，发布时间：${row.publishDate || '未读取'}，时长：${row.durationSec || '未知'}秒`);
    if (!row.ok) {
      lines.push(`- 读取失败：${row.error}`);
      lines.push('');
      continue;
    }
    lines.push(`- 钩子机制：${row.hookMechanics.join('、')}`);
    lines.push(`- 文案结构：${row.structureFormula}`);
    lines.push(`- 画面语法：${row.visualGrammar}`);
    lines.push(`- 转化信号：${row.conversionSignals.join('、')}`);
    lines.push(`- 可复用公式：${row.reusableFormula}`);
    lines.push(`- 证据等级：${row.evidenceLevel}`);
    if (row.chapterEvidence?.length) {
      lines.push(`- 平台章节摘要：${row.chapterEvidence.slice(0, 8).join(' / ')}`);
    }
    if (row.commentEvidence?.length) {
      lines.push(`- 评论片段：${row.commentEvidence.slice(0, 6).join(' / ')}`);
    }
    lines.push('');
  }
  lines.push('## 方法库新增卡片', '');
  for (const block of videoMethodBlocks) {
    lines.push(`### ${block.title}`, '');
    lines.push(`- 方法：${block.methods.join('、')}`);
    lines.push(`- 场景：${block.scenarios.join('、')}`);
    lines.push(`- 骨架：${block.outputTemplate.join('、')}`);
    lines.push(`- 示例：${block.example}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function updateStructuredBlocks() {
  const structured = JSON.parse((await fs.readFile(structuredPath, 'utf8')).replace(/^\uFEFF/, ''));
  const ids = new Set((structured.blocks || []).map((block) => block.id));
  let added = 0;
  for (const block of videoMethodBlocks) {
    if (!ids.has(block.id)) {
      structured.blocks.push(block);
      added += 1;
    }
  }
  if (added) {
    structured.version = '2026-07-10-video-deep-methods-v1';
    structured.description = `${structured.description || ''} Added video-level benchmark method cards.`.trim();
    await fs.writeFile(structuredPath, `${JSON.stringify(structured, null, 2)}\n`, 'utf8');
  }
  return added;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const rows = await readEvidence();
  const summaries = groupSummary(rows);
  const result = {
    generatedAt: new Date().toISOString(),
    note: 'Video-level analysis derived from Douyin page evidence. Missing transcripts are not invented.',
    rows,
    summaries,
    methodBlocks: videoMethodBlocks,
  };
  await fs.writeFile(path.join(outDir, 'video-deep-analysis.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outDir, 'video-deep-analysis.md'), toMarkdown(rows, summaries), 'utf8');
  const added = await updateStructuredBlocks();
  console.log(JSON.stringify({
    ok: true,
    videos: rows.length,
    okVideos: rows.filter((row) => row.ok).length,
    withChapterSummary: rows.filter((row) => row.ok && row.hasChapterSummary).length,
    addedMethodBlocks: added,
    files: [
      path.join(outDir, 'video-deep-analysis.json'),
      path.join(outDir, 'video-deep-analysis.md'),
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
