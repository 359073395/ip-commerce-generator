import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const videoAnalysisPath = path.join(root, 'outputs', 'account_video_deep_analysis', 'video-deep-analysis.json');
const outDir = path.join(root, 'outputs', 'selected_deep_dive');
const docsPath = path.join(root, 'docs', 'selected-benchmark-deep-dive.md');
const structuredPath = path.join(root, 'knowledge', 'structured-blocks.json');

const selectedIndexes = [1, 2, 4, 5, 6, 11, 13, 15, 31, 46, 51, 52, 71, 74, 77, 80, 101, 105, 106, 107, 110, 126, 131, 132];

const userCoreCases = [
  {
    id: 'wutian-case-business-etiquette',
    title: '吾天律师咨询起量：工程上的商务礼仪',
    source: '用户口述成功账号经验',
    hook: '拖欠多年的工程款到账，把胜诉/到账和工程老板请吃饭喝酒放在第一屏。',
    mechanism: '用到账结果炫富，再用红包、喝酒、人情世故证明工程老板圈层真实，最后回到风险共担产品优势。',
    reusable: '第一句先给结果和金额，再讲客户为什么难、团队怎么站在客户一边，最后用大白话承接电话咨询。',
  },
  {
    id: 'wutian-case-test-by-boss',
    title: '吾天律师咨询起量：工程大哥对我们的一次考验',
    source: '用户口述成功账号经验',
    hook: '国央企/强对方 + 大金额工程款 + 打赢并多争取违约金。',
    mechanism: '把强对手和高金额前置，先证明能打硬仗，再反转成老板认可团队、愿意介绍业务。',
    reusable: '高客单专业服务要把“对手强、过程难、结果硬、客户认可”连成信任链。',
  },
  {
    id: 'wutian-case-risk-shared-offer',
    title: '吾天律师直接转化：愿意和工程老板风险共担',
    source: '用户口述成功账号经验',
    hook: '工程款被卡住，老板没钱打官司，但又被上下游压着。',
    mechanism: '不讲用户听不懂的专业名词，用“前期不收费、要不回来分文不取”解释全风险代理。',
    reusable: '转化话术要先承认客户怕得罪人、怕费用高、怕赢了拿不到钱，再用风险共担化解。',
  },
];

const deepMethodBlocks = [
  {
    id: 'ip-deep-consultation-trigger-proof-chain',
    category: 'personal_ip',
    moduleIds: ['conversion-topics', 'script', 'ip-positioning'],
    title: '深挖方法：高咨询内容的证据链开头',
    methods: ['结果前置', '金额/强对手', '客户困境', '过程难度', '专业结果', '咨询承接'],
    scenarios: ['工程律师IP', '高客单咨询', '专业服务IP', 'B端服务'],
    requiredInputs: ['结果或阶段性进展', '金额/规模', '强对手或复杂程度', '客户真实困境', '团队动作', '电话/私信入口'],
    outputTemplate: ['第一句结果', '金额或强对手', '客户被压垮的处境', '团队怎么介入', '结果/进展', '电话咨询CTA'],
    example: '工程律师内容不是先讲法条，而是先讲工程款到账、国央企强对手、老板快撑不住、团队风险共担。',
    keywords: ['咨询起量', '证据链', '金额前置', '强对手', '客户困境', '电话咨询', '工程款'],
  },
  {
    id: 'ip-deep-risk-shared-plain-offer',
    category: 'personal_ip',
    moduleIds: ['conversion-topics', 'script', 'pain-topics'],
    title: '深挖方法：风险共担的大白话成交表达',
    methods: ['不用专业名词', '承认顾虑', '风险共担', '前期不收费', '结果导向收费', '电话承接'],
    scenarios: ['律师服务', '咨询服务', '高客单服务', '难成交服务'],
    requiredInputs: ['客户不成交顾虑', '收费方式', '可承诺边界', '服务结果', '承接方式'],
    outputTemplate: ['说出顾虑', '解释为什么难', '大白话讲产品', '降低行动风险', '电话/私信CTA'],
    example: '不要只说全风险代理，要说“你不是不想打，是现在被工程款卡住，前期不收费，要不回来分文不取”。',
    keywords: ['风险共担', '前期不收费', '分文不取', '异议化解', '全风险代理', '成交话术'],
  },
  {
    id: 'ip-deep-silent-high-intent-conversion',
    category: 'personal_ip',
    moduleIds: ['conversion-topics', 'ip-positioning', 'viral-analysis'],
    title: '深挖方法：少评论高私信的沉默转化判断',
    methods: ['高隐私行业', '评论少不等于无效', '私信/电话优先', '身份识别词', '感同身受词'],
    scenarios: ['工程律师IP', '法律服务', '债务回款', '高隐私咨询', 'B端纠纷'],
    requiredInputs: ['行业隐私程度', '私信第一句话', '电话咨询数量', '评论高意向词', '账号识别词'],
    outputTemplate: ['判断评论公开风险', '列高意向信号', '设置固定识别词', '优化主页和CTA', '按私信电话复盘'],
    example: '工程老板不愿公开暴露身份，所以要重点看“是不是吾天律师”、要联系方式、电话咨询和感同身受。',
    keywords: ['沉默转化', '私信', '电话咨询', '是不是吾天律师', '高隐私', '高意向信号'],
  },
  {
    id: 'ip-deep-local-real-person-emotion',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'script', 'viral-topics'],
    title: '深挖方法：本地真实人设的情绪粗粝感',
    methods: ['方言亲切', '本地自己人', '情绪强', '不完美真实', '江湖气', '替用户对抗强权'],
    scenarios: ['本地服务IP', '工程律师IP', '实体老板IP', '区域专家IP'],
    requiredInputs: ['本地身份', '受众关系感', '可使用口吻', '情绪边界', '能展示的真实场景'],
    outputTemplate: ['本地身份开场', '替用户说心里话', '情绪表达', '真实场景证据', '专业结果收束'],
    example: '方言、喝酒后的粗粝感、团建、对话和参观不是随意生活化，而是在证明“我是你们这边的人”。',
    keywords: ['方言', '本地化', '真实人设', '江湖气', '情绪强', '自己人', '工程老板'],
  },
  {
    id: 'ip-deep-first-person-busy-beat',
    category: 'personal_ip',
    moduleIds: ['script', 'viral-analysis', 'conversion-topics'],
    title: '深挖方法：第一视角忙碌证明的镜头节奏',
    methods: ['第一视角', '连续服务动作', '客单价信号', '顾客反应', '团队状态', '预约/招聘承接'],
    scenarios: ['美甲美睫', '美容院', '本地门店', '服务业招聘', '同城到店'],
    requiredInputs: ['一天服务流程', '忙碌证据', '高客单项目', '顾客反馈', '门店/团队镜头', '预约入口'],
    outputTemplate: ['开门/预约爆满', '连续服务动作', '高客单项目特写', '顾客反馈', '团队日常', '预约/招聘CTA'],
    example: '美甲店第一视角不是流水账，而是把忙、贵、顾客喜欢、团队真实拍成信任资产。',
    keywords: ['第一视角', '忙碌证明', '业绩大爆炸', '千元美甲', '预约', '招聘', '同城到店'],
  },
  {
    id: 'ip-deep-street-transformation-loop',
    category: 'personal_ip',
    moduleIds: ['viral-analysis', 'script', 'viral-topics'],
    title: '深挖方法：街头改造的连续栏目飞轮',
    methods: ['抓路人', '第N天栏目', '前后对比', '当事人反应', '少废话授权', '课程承接'],
    scenarios: ['变美IP', '审美服务', '线下课程', '技术型服务'],
    requiredInputs: ['改造对象', '改造前痛点', '改造结果', '当事人反应', '栏目编号', '服务/课程入口'],
    outputTemplate: ['第N天开场', '对象痛点', '少废话进入改造', '过程压缩', '结果对比', '课程/服务CTA'],
    example: '街头抓路人改眉毛的重点不是街头，而是连续栏目让陌生人的变化持续证明技术。',
    keywords: ['抓路人', '街头改造', '前后对比', '第N天', '少废话', '变美', '课程承接'],
  },
  {
    id: 'ip-deep-question-as-tool',
    category: 'combined',
    moduleIds: ['script', 'pain-topics', 'commerce', 'viral-analysis'],
    title: '深挖方法：把专业判断变成用户可复制的一句话',
    methods: ['你就这么问', '替用户问导购', '降低决策难度', '识别商家话术', '收藏型工具'],
    scenarios: ['装修建材', '高决策消费', '测评账号', '本地服务', '带货测评'],
    requiredInputs: ['购买场景', '用户不会问的问题', '商家容易模糊的点', '正确提问句式', '判断答案标准'],
    outputTemplate: ['别这样问', '你就这么问', '对方答A说明什么', '对方答B要小心', '收藏/咨询CTA'],
    example: '冰箱、智能锁、瓷砖这类内容，把专家经验变成用户下次进店能直接照着问的一句话。',
    keywords: ['你就这么问', '导购', '提问模板', '装修避坑', '建材', '收藏', '测评'],
  },
  {
    id: 'ip-deep-factory-space-proof-tour',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'script', 'conversion-topics'],
    title: '深挖方法：工厂老板的空间资产巡游',
    methods: ['空间规模前置', '展厅/工厂巡游', '投入金额', '产品线证明', '老板故事', '询盘承接'],
    scenarios: ['工厂老板IP', '家居定制', '电气设备', 'B端供应链', '外贸工厂'],
    requiredInputs: ['展厅/工厂面积', '投入金额', '设备/库存', '产品线', '老板故事', '询盘入口'],
    outputTemplate: ['规模金额第一句', '空间巡游', '产品线镜头', '老板投入原因', '客户能得到什么', '询盘/直播CTA'],
    example: '七位数展厅、5000㎡实景展厅、2亿工厂，本质是把供应链能力拍成用户看得见的信任。',
    keywords: ['工厂老板', '展厅', '七位数', '5000㎡', '2亿工厂', '空间资产', 'B端询盘'],
  },
  {
    id: 'ip-deep-low-follower-viral-remix',
    category: 'personal_ip',
    moduleIds: ['viral-topics', 'rewrite', 'script'],
    title: '深挖方法：低粉爆款结构改编',
    methods: ['低粉高赞', '评论准', '开头狠', '结构保留', '行业词替换', '口吻重写'],
    scenarios: ['冷启动账号', '个人IP选题', '跨行业借鉴', '爆款改编'],
    requiredInputs: ['对标视频链接', '原开头结构', '评论区反馈', '自己的行业事实', '自己的案例和承接'],
    outputTemplate: ['记录原钩子结构', '判断评论是否精准', '保留注意力顺序', '替换行业事实', '改成自己口吻', '接入CTA'],
    example: '最值得借鉴的是低粉爆款：不是复制原句，而是保留已经验证的注意力顺序，再换成自己的行业事实和案例。',
    keywords: ['低粉爆款', '评论准', '开头狠', '结构改编', '行业词替换', '跨行业借鉴', '冷启动'],
  },
];

function pickRows(allRows) {
  const byIndex = new Map(allRows.map((row) => [row.index, row]));
  return selectedIndexes.map((index) => byIndex.get(index)).filter(Boolean);
}

function inferDeepMechanism(row) {
  const hay = `${row.title}\n${row.group}\n${(row.chapterEvidence || []).join('\n')}`;
  if (/摆摊|卖菜|跨场景|陌生场景|反差/.test(hay)) return '跨场景反差：让行业身份进入陌生场景，用争议和误解制造停留';
  if (/工程|工程款|律师|回款|执行/.test(hay)) return '专业服务高咨询：行业现实/客户困境/团队证据/电话承接';
  if (/第一视角|美甲|业绩|忙碌|顾客/.test(hay)) return '服务业忙碌证明：第一视角把客流、客单价和顾客反馈拍成信任';
  if (/抓路人|眉|改造|变装|前后对比/.test(hay)) return '技术服务证明：陌生人改造和前后对比降低自夸感';
  if (/装修|瓷砖|导购|冰箱|智能锁|验收|水电/.test(hay)) return '高决策避坑：把专业判断变成清单或一句提问模板';
  if (/工厂|展厅|全屋定制|七位数|2亿|5000/.test(hay)) return 'B端资产证明：空间、规模和投入金额前置';
  if (/文案|流量|管理者|课程|短视频|成交/.test(hay)) return '课程咨询筛选：强观点和学员/认知差筛出高意向用户';
  return '个人IP通用：身份、证据、情绪和转化入口绑定';
}

function buildBeatTable(row) {
  const mechanism = inferDeepMechanism(row);
  if (mechanism.includes('跨场景反差')) {
    return [
      ['0-3秒', '行业身份进入陌生场景', '用不协调感制造停留'],
      ['3-12秒', '展示陌生场景动作', '引发评论区争议和讨论'],
      ['12-25秒', '抛出行业洞察', '把热闹拉回专业判断'],
      ['25秒后', '回扣产品/服务/方法', '承接同城或课程需求'],
    ];
  }
  if (mechanism.includes('高咨询')) {
    return [
      ['0-3秒', '行业现实或结果开头', '先让目标客户觉得“这说的是我”'],
      ['3-10秒', '客户困境/金额/强对手', '放大案件价值和决策压力'],
      ['10-25秒', '团队判断或过程证据', '证明不是只会讲道理'],
      ['25秒后', '结果/风险共担/电话CTA', '把内容流量导向咨询'],
    ];
  }
  if (mechanism.includes('忙碌证明')) {
    return [
      ['0-3秒', '第一视角进入忙碌现场', '直接给真实工作密度'],
      ['3-12秒', '连续服务动作', '用动作替代自夸'],
      ['12-25秒', '客单价/顾客反应/团队细节', '把忙碌变成商业信任'],
      ['25秒后', '预约/招聘/到店入口', '承接同城需求'],
    ];
  }
  if (mechanism.includes('技术服务')) {
    return [
      ['0-3秒', '改造对象和痛点', '让用户立刻看懂变化空间'],
      ['3-12秒', '授权/坐下/过程压缩', '降低表演感'],
      ['12-25秒', '前后对比和当事人反应', '用结果证明技术'],
      ['25秒后', '课程/服务承接', '把围观转成咨询'],
    ];
  }
  if (mechanism.includes('避坑')) {
    return [
      ['0-3秒', '具体购买/装修场景', '锁定正在决策的人'],
      ['3-15秒', '清单或提问句', '给用户可复制工具'],
      ['15-30秒', '错误答案/风险后果', '制造收藏和转发理由'],
      ['30秒后', '正确标准/咨询入口', '承接高意向用户'],
    ];
  }
  if (mechanism.includes('资产证明')) {
    return [
      ['0-3秒', '规模/金额/空间资产第一句', '先给强信任信号'],
      ['3-15秒', '展厅/工厂/产品线镜头', '把能力拍成现场证据'],
      ['15-30秒', '老板投入和客户收益', '从炫富回到合作理由'],
      ['30秒后', '询盘/直播/合作入口', '承接B端需求'],
    ];
  }
  return [
    ['0-3秒', '强观点或身份开场', '制造停留'],
    ['3-15秒', '案例/经历/证据', '建立可信'],
    ['15-30秒', '方法或判断', '给获得感'],
    ['30秒后', '私信/课程/咨询CTA', '承接行动'],
  ];
}

function makeDeepRows(rows) {
  return rows.map((row) => ({
    index: row.index,
    accountId: row.accountId,
    accountName: row.accountName,
    group: row.group,
    title: row.title,
    url: row.url,
    metricText: row.metricText,
    pinned: row.pinned,
    hasChapterSummary: row.hasChapterSummary,
    evidenceLevel: row.evidenceLevel,
    deepMechanism: inferDeepMechanism(row),
    beatTable: buildBeatTable(row),
    hookDiagnosis: diagnoseHook(row),
    conversionDiagnosis: diagnoseConversion(row),
    remakeFormula: buildRemakeFormula(row),
    missingEvidence: row.hasChapterSummary ? ['缺逐字稿', '缺私信/成交反馈'] : ['缺逐字稿', '缺完整画面', '缺私信/成交反馈'],
  }));
}

function diagnoseHook(row) {
  const title = row.title;
  if (/摆摊|卖菜/.test(title)) return '钩子用行业身份和陌生场景制造反差，先拿到停留和评论，再回扣专业观点。';
  if (/工程|工程款|律师|回款/.test(`${title}${row.group}`)) return '钩子不是泛痛点，而是行业现实和高压处境，适合筛出强需求客户。';
  if (/第一视角|忙碌|业绩|千元/.test(title)) return '钩子把“生意好”拍成第一视角证据，天然适合到店和招聘。';
  if (/抓路人|改眉毛|前后对比|变装/.test(title)) return '钩子用陌生人结果证明技术，降低“自己夸自己”的不信任。';
  if (/你就这么问|验收|十条|8个/.test(title)) return '钩子把复杂决策变成用户能立刻收藏的一句话或清单。';
  if (/七位数|5000|2亿|展厅|工厂/.test(title)) return '钩子把供应链资产放到第一句，先证明实力再讲产品。';
  return '钩子以身份、观点或具体场景直给，适合作为通用IP内容入口。';
}

function diagnoseConversion(row) {
  const signals = row.conversionSignals || [];
  if (signals.some((item) => item.includes('电话'))) return '适合电话/私信承接，前端指标不能只看评论，要看高意向私聊。';
  if (signals.some((item) => item.includes('到店'))) return '适合预约到店、团购券或本地服务承接，视频必须保留位置和项目线索。';
  if (signals.some((item) => item.includes('课程') || item.includes('资料'))) return '适合私信关键词、资料包、课程或训练营承接。';
  if (signals.some((item) => item.includes('B端'))) return '适合询盘、直播、工厂参观或合作表单承接。';
  return '转化入口证据不足，需要后续补私信、电话或成交反馈。';
}

function buildRemakeFormula(row) {
  const mechanism = inferDeepMechanism(row);
  if (mechanism.includes('跨场景反差')) return '用“行业人进入陌生场景 + 观众误解/争议 + 行业洞察 + 回扣服务/方法”改写。';
  if (mechanism.includes('高咨询')) return '用“行业现实/结果第一句 + 客户被压垮的处境 + 团队证据 + 风险共担/电话CTA”改写。';
  if (mechanism.includes('忙碌证明')) return '用“第一视角一天 + 连续服务动作 + 客单价/顾客反应 + 预约/招聘CTA”改写。';
  if (mechanism.includes('技术服务')) return '用“第N天挑战 + 对象痛点 + 过程压缩 + 前后对比 + 服务/课程CTA”改写。';
  if (mechanism.includes('避坑')) return '用“买/装X别这样问 + 你就这么问 + 答案判断 + 避坑提醒 + 收藏/咨询CTA”改写。';
  if (mechanism.includes('资产证明')) return '用“我投入X/有X㎡ + 带你看现场 + 产品线证明 + 为什么对客户有用 + 询盘CTA”改写。';
  return '保留原视频的注意力顺序，替换行业事实、人物口吻、案例证据和转化入口。';
}

function toMarkdown(deepRows) {
  const lines = [
    '# 精选对标视频深挖报告',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 本次深挖范围',
    '',
    `- 精选外部视频：${deepRows.length} 条`,
    `- 用户成功母样本：${userCoreCases.length} 条`,
    `- 新增深挖方法卡：${deepMethodBlocks.length} 张`,
    '- 类别：个人IP为主，兼顾带货/测评/本地到店/B端询盘。',
    '- 证据边界：没有逐字稿的视频不编造原话，只基于标题、页面可见文本、章节摘要、评论片段和用户口述经验。',
    '',
    '## 深挖结论',
    '',
    '- 真正值得沉淀的不是“账号风格”，而是每类内容如何把证据放进第一句、第一屏和转化入口。',
    '- 吾天律师母方法最核心：高价值结果前置、工程老板困境、风险共担、真实本地自己人、少评论高私信。',
    '- 外部对标验证了迁移方式：美业把证据拍成忙碌和改造，装修把证据变成可复制提问，工厂把证据变成空间资产。',
    '- Agent 以后生成时要优先判断：这是涨粉内容、信任内容，还是咨询/成交内容。三者不能混写。',
    '',
    '## 吾天母样本深挖',
    '',
  ];
  for (const item of userCoreCases) {
    lines.push(`### ${item.title}`, '');
    lines.push(`- 来源：${item.source}`);
    lines.push(`- 第一钩子：${item.hook}`);
    lines.push(`- 起效机制：${item.mechanism}`);
    lines.push(`- 可复用公式：${item.reusable}`);
    lines.push('');
  }
  lines.push('## 精选视频逐条深挖', '');
  for (const row of deepRows) {
    lines.push(`### ${String(row.index).padStart(3, '0')} ${row.accountName}｜${row.group}`, '');
    lines.push(`- 标题：${row.title}`);
    lines.push(`- 链接：${row.url}`);
    lines.push(`- 数据：${row.pinned ? '置顶，' : ''}${row.metricText || '-'}；证据等级：${row.evidenceLevel}`);
    lines.push(`- 深层机制：${row.deepMechanism}`);
    lines.push(`- 钩子诊断：${row.hookDiagnosis}`);
    lines.push(`- 转化诊断：${row.conversionDiagnosis}`);
    lines.push(`- 改写公式：${row.remakeFormula}`);
    lines.push(`- 缺失证据：${row.missingEvidence.join('、')}`);
    lines.push('');
    lines.push('| 阶段 | 内容动作 | 作用 |');
    lines.push('| --- | --- | --- |');
    for (const beat of row.beatTable) lines.push(`| ${beat[0]} | ${beat[1]} | ${beat[2]} |`);
    lines.push('');
  }
  lines.push('## 新增深挖方法卡', '');
  for (const block of deepMethodBlocks) {
    lines.push(`### ${block.title}`, '');
    lines.push(`- 方法：${block.methods.join('、')}`);
    lines.push(`- 场景：${block.scenarios.join('、')}`);
    lines.push(`- 必填信息：${block.requiredInputs.join('、')}`);
    lines.push(`- 输出骨架：${block.outputTemplate.join(' -> ')}`);
    lines.push(`- 示例：${block.example}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function updateStructuredBlocks() {
  const structured = JSON.parse((await fs.readFile(structuredPath, 'utf8')).replace(/^\uFEFF/, ''));
  const ids = new Set((structured.blocks || []).map((block) => block.id));
  let added = 0;
  for (const block of deepMethodBlocks) {
    if (!ids.has(block.id)) {
      structured.blocks.push(block);
      added += 1;
    }
  }
  if (added) {
    structured.version = '2026-07-10-selected-deep-dive-v1';
    structured.description = `${structured.description || ''} Added selected deep-dive method cards.`.trim();
    await fs.writeFile(structuredPath, `${JSON.stringify(structured, null, 2)}\n`, 'utf8');
  }
  return added;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const source = JSON.parse((await fs.readFile(videoAnalysisPath, 'utf8')).replace(/^\uFEFF/, ''));
  const deepRows = makeDeepRows(pickRows(source.rows || []));
  const result = {
    generatedAt: new Date().toISOString(),
    note: 'Selected deep dive derived from local evidence and user-provided Wutian account experience.',
    userCoreCases,
    deepRows,
    deepMethodBlocks,
  };
  await fs.writeFile(path.join(outDir, 'selected-deep-dive.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const markdown = toMarkdown(deepRows);
  await fs.writeFile(path.join(outDir, 'selected-deep-dive.md'), markdown, 'utf8');
  await fs.writeFile(docsPath, markdown, 'utf8');
  const added = await updateStructuredBlocks();
  console.log(JSON.stringify({
    ok: true,
    selectedVideos: deepRows.length,
    userCoreCases: userCoreCases.length,
    addedMethodBlocks: added,
    files: [
      path.join(outDir, 'selected-deep-dive.json'),
      path.join(outDir, 'selected-deep-dive.md'),
      docsPath,
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
