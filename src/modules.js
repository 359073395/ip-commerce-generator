import {
  BadgeCheck,
  BarChart3,
  CalendarDays,
  ClipboardPen,
  Flame,
  LayoutTemplate,
  Megaphone,
  RefreshCcw,
  Repeat2,
  Sparkles,
} from 'lucide-react';

const commonInherited = [
  { name: '继承IP定位', description: '使用IP定位里的行业、人设、目标用户和商业路径作为上下文。' },
  { name: '补充当前模块信息', description: '当前模块只收必要参数，完整判断交给知识库和模型。' },
];

const ipRows = [
  ['industry', '行业/赛道', '选择或补充行业', ['本地实体', '专业服务', '教育培训', '美业', '宠物', '家居装修', '企业服务', '知识课程', '跨境电商', '其他']],
  ['role', '身份/角色', '选择最接近的个人IP身份', ['老板/创始人', '专家/顾问', '老师/教练', '一线从业者', '医生/律师等专业人士', '店长/销售', '达人/主播', '其他']],
  ['offer', '卖什么', '选择主要变现对象', ['咨询服务', '到店服务', '课程/训练营', '高客单服务', '私域成交', '社群/会员', '品牌合作', '其他']],
  ['buyer', '卖给谁', '选择核心目标用户', ['新手用户', '高客单客户', '本地到店客户', '宝妈/家庭用户', '创业/经营者', '职场人群', '中老年人群', '其他']],
  ['proof', '信任资产', '选择已有证明', ['资质证书', '成功案例', '客户评价', '前后对比', '从业经历', '门店/工厂/现场', '暂无']],
  ['contentCondition', '内容条件', '选择可呈现内容', ['真人口播', '半出镜', '不出镜', '晒过程', '讲案例', '展示产品/现场', '直播']],
  ['conversion', '承接方式', '选择主要转化入口', ['评论关键词', '私信', '表单', '到店', '私域', '直播咨询', '预约/电话', '线上课程', '团购券', '商品卡/小黄车', 'TikTok Shop', '独立站/店铺', '社群/会员']],
  ['details', '具体补充', '写具体行业、产品名、城市、案例或不能碰的边界。', null, { required: false }],
];

const originalInput = (placeholder, title = '第一步：请输入您的行业和人设', required = true) => ({
  title,
  original: true,
  required,
  fields: [['prompt', title, placeholder]],
});

const scriptTypeDetails = {
  教知识: {
    subtitle: '推荐型、解题型、案例型、揭秘型',
    lines: [
      '推荐型：美好愿景、固定人群、引发好奇',
      '解题型：场景难题、低行动成本、具体操作过程',
      '案例型：案例描述、知识点总结、用户应用方法',
      '揭秘型：提出揭秘事件、讲述内幕、避免方法',
    ],
  },
  晒过程: {
    subtitle: '过程展示、测评产品、任务挑战、事件体验',
    lines: ['过程展示：服务现场、交付过程、证明材料', '测评产品：真实体验、横向对比、替用户质检'],
  },
  讲故事: {
    subtitle: '客户案例、转折经历、结果变化、价值升华',
    lines: ['客户案例：处境、错误选择、解决过程、结果变化', '个人故事：经历、冲突、转折、观点沉淀'],
  },
  聊观点: {
    subtitle: '立场、争议、反常识、评论互动',
    lines: ['表达立场：支持谁、反对什么、为什么', '制造讨论：反常识观点、争议切入、评论互动'],
  },
};

const scriptSubtypeChoices = {
  教知识: [
    { label: '推荐型', description: '美好愿景、固定人群、引发好奇' },
    { label: '解题型', description: '场景难题、低行动成本、具体操作过程' },
    { label: '案例型', description: '案例描述、知识点总结、用户应用方法' },
    { label: '揭秘型', description: '提出揭秘事件、讲述内幕、避免方法' },
  ],
  晒过程: [
    { label: '过程展示', description: '服务现场、交付过程、证明材料' },
    { label: '测评产品', description: '真实体验、横向对比、替用户质检' },
    { label: '任务挑战', description: '设定挑战、记录执行、展示结果' },
    { label: '事件体验', description: '真实事件、亲身体验、复盘结论' },
  ],
  讲故事: [
    { label: '客户案例', description: '处境、错误选择、解决过程、结果变化' },
    { label: '转折经历', description: '冲突、低谷、关键动作、转折结果' },
    { label: '结果变化', description: '前后对比、关键节点、可复制方法' },
    { label: '价值升华', description: '故事结论、行业观点、用户启发' },
  ],
  聊观点: [
    { label: '立场表达', description: '支持谁、反对什么、为什么' },
    { label: '争议讨论', description: '争议切入、双方观点、明确判断' },
    { label: '反常识', description: '打破误区、解释原因、给出新认知' },
    { label: '评论互动', description: '回应评论、抛出问题、引导讨论' },
  ],
};

const viralElementDetails = {
  成本类: { subtitle: '金钱、时间、面子、力气', lines: ['把普通选题变成省钱、省时、省力或更有面子的表达。'] },
  人群类: { subtitle: '特定人群、身份标签、圈层共鸣', lines: ['围绕新手、老板、宝妈、同行等人群生成更精准选题。'] },
  奇葩类: { subtitle: '猎奇、内幕、反常识、神奇操作', lines: ['用外行不知道、内行才懂的角度制造停留。'] },
  头牌类: { subtitle: '最贵、最牛、第一名、标杆案例', lines: ['把行业里的头牌、天花板、代表案例视频化。'] },
  怀旧类: { subtitle: '过去与现在、年代记忆、经典对比', lines: ['用时代变化、老经验和新做法形成内容对比。'] },
  反差类: { subtitle: '对立、前后对比、身份反差', lines: ['制造强弱、贵贱、前后、内外行之间的冲突。'] },
  最差类: { subtitle: '避坑、踩雷、最不推荐', lines: ['用吐槽和反面清单降低用户决策成本。'] },
  荷尔蒙类: { subtitle: '吸引力、面子、审美、关系', lines: ['围绕好看、体面、关系评价和吸引力生成选题。'] },
};

const conversionDetails = {
  咨询成交: { subtitle: '评论、私信、表单、预约', lines: ['适合咨询服务、顾问、老师、专家型账号。'] },
  私域成交: { subtitle: '微信、社群、朋友圈、长期信任', lines: ['适合需要反复种草和信任积累的服务。'] },
  直播成交: { subtitle: '直播间讲解、互动、促单', lines: ['适合需要现场解释、演示、限时承接的成交。'] },
  到店成交: { subtitle: '本地门店、同城转化、预约到店', lines: ['适合餐饮、美业、家装、宠物、本地服务。'] },
  '课程/服务成交': { subtitle: '课程、训练营、高客单服务', lines: ['适合通过案例、方法和结果证明建立信任。'] },
};

const painDetails = {
  焦虑痛点: { subtitle: '担心错过、担心变差、担心来不及', lines: ['把用户心里的紧张感翻译成可点击选题。'] },
  成本痛点: { subtitle: '怕花冤枉钱、怕浪费时间、怕费力', lines: ['突出低成本解决问题或少踩坑的价值。'] },
  风险痛点: { subtitle: '怕被坑、怕没效果、怕售后差', lines: ['用避坑、判断标准和证明材料降低风险感。'] },
  决策痛点: { subtitle: '不会选、不知道怎么判断、信息太乱', lines: ['提供判断标准、对比维度和选择路径。'] },
  '面子/情绪痛点': { subtitle: '怕丢脸、怕被笑、想更体面', lines: ['把情绪和身份评价转成更有共鸣的表达。'] },
  使用场景痛点: { subtitle: '具体场景、具体问题、具体结果', lines: ['从真实生活或工作场景里找视频切口。'] },
};

const dealReasonDetails = {
  效果好: { subtitle: '通过使用产品/技术手艺等服务，能得到明显的效果' },
  好评多: { subtitle: '产品使用/服务后体验感好，客户夸赞、复购多、转介绍' },
  性价比: { subtitle: '同价位产品里质量好，同款产品里价格低/量更大、赠品多' },
  老板好: { subtitle: '老板实在、性格好、大方；豪爽洒脱、有爱心、没架子、老板人正直、有原则' },
  便利性: { subtitle: '使用方便、距离近、省时、省力' },
  专业强: { subtitle: '从业时间长、获得奖项、熟练' },
  服务好: { subtitle: '服务热情、耐心贴心售后负责、响应迅速、送货上门、仔细' },
  有特色: { subtitle: '环境、菜品、服务和同行有区别' },
  选择多: { subtitle: '产品种类多、好搭配、一站式服务' },
  有面子: { subtitle: '彰显品味、限量的、排队难的、不好买的、贵的、牌子的、小众的' },
  质量好: { subtitle: '产品耐用、方便使用、用料扎实、安全可靠' },
  生意好: { subtitle: '顾客多、订单多、断货、排队' },
  规模大: { subtitle: '面积大、设备全、员工多、连锁店、展示实力、建立信任' },
  案例多: { subtitle: '成功案例多、说服力高、增强信任度' },
  颜值高: { subtitle: '拍照好看、网红打卡、有装饰性、环境高档' },
};

const mainScriptGroup = {
  title: '主脚本选择',
  stepTitle: '第二步：主脚本选择',
  options: ['教知识', '晒过程', '讲故事', '聊观点'],
  details: scriptTypeDetails,
  subChoices: scriptSubtypeChoices,
};

export const modules = [
  {
    id: 'ip-positioning',
    name: 'IP定位',
    icon: BadgeCheck,
    description: '这里只做个人IP定位；带货内容走独立的「带货」模块。前端只收定位参数，完整方案由知识库生成。',
    frontendMode: 'original',
    formGroups: [{ title: 'IP定位表', fields: ipRows, required: true }],
    generateLabel: '生成IP定位',
  },
  {
    id: 'viral-topics',
    name: '爆款选题',
    icon: Flame,
    description: '按原版爆款选题分类进入，完整选题逻辑由知识库展开。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [mainScriptGroup],
    formGroups: [originalInput('请输入您的行业和人设信息，越详细越好，例如：美妆博主，专注敏感肌护理，有5年经验...')],
    generateLabel: '生成爆款选题',
  },
  {
    id: 'conversion-topics',
    name: '成交选题',
    icon: BarChart3,
    description: '按原版主脚本和进店/成交理由进入，完整成交选题逻辑由知识库生成。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [
      mainScriptGroup,
      {
        title: '进店/成交理由选择',
        stepTitle: '第三步：进店/成交理由选择',
        options: ['效果好', '好评多', '性价比', '老板好', '便利性', '专业强', '服务好', '有特色', '选择多', '有面子', '质量好', '生意好', '规模大', '案例多', '颜值高'],
        details: dealReasonDetails,
        multiSelect: true,
      },
    ],
    formGroups: [originalInput('请输入您的行业和人设信息，越详细越好，例如：美妆博主，专注敏感肌护理，有5年经验...')],
    generateLabel: '生成高变现选题',
  },
  {
    id: 'operation-plan',
    name: '运营规划',
    icon: CalendarDays,
    description: '根据账号阶段、商业目标和近期数据，生成选题排序、发布节奏、爆款后接力和复盘动作。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [
      {
        title: '账号阶段',
        stepTitle: '第一步：账号阶段选择',
        options: ['不确定/让系统判断', '冷启动期', '起量期', '建信任期', '转化期', '稳定期', '爆款后'],
        variant: 'primary',
      },
      {
        title: '运营目标',
        stepTitle: '第二步：运营目标选择',
        options: ['涨粉起量', '建立信任', '私信咨询', '电话/预约', '到店成交', '课程成交', '产品成交', 'B端询盘'],
        multiSelect: true,
      },
      {
        title: '规划周期',
        stepTitle: '第三步：规划周期选择',
        options: ['7天', '14天', '30天'],
      },
    ],
    formGroups: [
      {
        title: '运营信息',
        original: true,
        required: true,
        fields: [
          ['prompt', '账号现状和业务目标', '写清楚行业、人设、卖什么、目标用户、承接方式。比如：工程纠纷律师IP，目标实际施工人和材料商，电话咨询，想做14天起量转化计划。'],
          ['recentData', '近期数据/爆款信号', '可选：粉丝量、近7天播放、咨询数量、爆过的视频、评论区高频问题。', null, { required: false }],
          ['assets', '可用信任资产', '可选：案例、评价、合同/判决书打码、门店/工厂/现场、团队过程。', null, { required: false }],
        ],
      },
    ],
    generateLabel: '生成运营规划',
  },
  {
    id: 'pain-topics',
    name: '痛点选题',
    icon: Sparkles,
    description: '按原版行业背景和目标客户输入，完整痛点挖掘和选题生成由知识库完成。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [],
    formGroups: [
      {
        title: '痛点输入',
        original: true,
        required: true,
        fields: [
          ['industryBackground', '行业背景', '比如我是干了7年的宠物医生，目前有一家宠物医院'],
          ['targetCustomer', '目标客户', '比如：想要养猫狗的家庭客户'],
        ],
      },
    ],
    generateLabel: '挖出用户痛点',
  },
  {
    id: 'script',
    name: '脚本创作',
    icon: ClipboardPen,
    description: '保留原版“主脚本选择 -> 继续选择”的体验，完整脚本骨架由知识库生成。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [
      { title: '主脚本选择', stepTitle: '第一步：主脚本选择', options: ['个人IP脚本', '成交脚本', '带货脚本'], variant: 'primary' },
      {
        title: '继续选择',
        stepTitle: '第二步：继续选择',
        dependsOn: 0,
        optionsByParent: {
          个人IP脚本: ['教知识', '晒过程', '讲故事', '聊观点'],
          成交脚本: ['痛点成交', '案例成交', '信任背书', '异议化解', '私域承接'],
          带货脚本: ['种草', '测评', '过程', '故事', '直播预热'],
        },
        details: {
          ...scriptTypeDetails,
          痛点成交: { subtitle: '痛点放大、信任证明、行动指令', lines: ['先说痛点，再给解决路径，最后承接咨询或成交。'] },
          案例成交: { subtitle: '案例处境、解决过程、结果证明', lines: ['用真实案例建立可信度和购买理由。'] },
          信任背书: { subtitle: '资质、评价、过程、结果', lines: ['把证明材料视频化，降低用户不信任。'] },
          异议化解: { subtitle: '怕贵、怕没用、怕麻烦、怕被坑', lines: ['把用户顾虑提前说透，给出判断标准。'] },
          私域承接: { subtitle: '评论关键词、私信、表单、社群', lines: ['让内容自然过渡到私域或预约入口。'] },
          种草: { subtitle: '场景需求、兴趣激发、产品引入', lines: ['先让用户想要，再自然引出产品。'] },
          测评: { subtitle: '横向测评、纵向测评、极限测评', lines: ['替用户测试和对比，降低决策成本。'] },
          过程: { subtitle: '制作、质检、服务、门店、工厂', lines: ['用过程可视化建立信任。'] },
          故事: { subtitle: '客户处境、错误选择、解决过程', lines: ['用故事推动情绪和成交理由。'] },
          直播预热: { subtitle: '看点、福利、时间、行动提醒', lines: ['为直播间提前制造期待和进入理由。'] },
        },
        subChoices: scriptSubtypeChoices,
      },
    ],
    formGroups: [originalInput('输入选题、产品/服务、目标用户、时长或必须出现的信息，后台会生成完整可拍脚本。')],
  },
  {
    id: 'rewrite',
    name: '文案二创',
    icon: Repeat2,
    description: '保留核心逻辑，换人群、场景、痛点、情绪或平台表达。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [
      {
        title: '二创方向',
        stepTitle: '第一步：二创方向',
        options: ['换人群', '换场景', '换痛点', '换情绪', '换结构', '换平台', '本土化表达'],
        variant: 'primary',
      },
    ],
    formGroups: [originalInput('粘贴原文案，并补充想保留什么、要换成什么人群/场景/平台/风格。')],
  },
  {
    id: 'viral-analysis',
    name: '爆款拆解',
    icon: LayoutTemplate,
    description: '拆钩子、结构、情绪、成交链路和拍摄剪辑，输出可复用模板。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [
      {
        title: '拆解维度',
        stepTitle: '第一步：拆解维度',
        options: ['钩子拆解', '结构拆解', '情绪拆解', '成交链路拆解', '拍摄剪辑拆解', '可复用模板'],
        variant: 'primary',
      },
    ],
    formGroups: [originalInput('粘贴短视频链接、爆款文案、OCR文本或参考内容，后台会拆解并迁移成可复用结构。')],
  },
  {
    id: 'polish',
    name: '文案洗稿',
    icon: RefreshCcw,
    description: '结构重组、痛点重写、观点重写、故事重写，生成新表达版本。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [
      {
        title: '洗稿方向',
        stepTitle: '第一步：洗稿方向',
        options: ['结构重组', '痛点重写', '观点重写', '故事重写', '带货重写', '短句口播化'],
        variant: 'primary',
      },
    ],
    formGroups: [originalInput('粘贴原文案，并说明必须保留的信息、要避开的表达或目标风格。')],
  },
  {
    id: 'commerce',
    name: '带货',
    icon: Megaphone,
    description: '带货视频独立在这里处理：需求、成交理由、信任证明、视觉化、承接、复盘。',
    frontendMode: 'original',
    inherited: commonInherited,
    optionGroups: [
      { title: '带货链路', options: ['产品需求', '成交理由', '信任证明', '商品视觉化', '顾虑化解', 'CTA'], variant: 'primary' },
      { title: '成交入口', options: ['商品卡', '小黄车', '直播间', '私域', '到店', 'TikTok Shop'] },
    ],
    formGroups: [
      {
        title: '带货参数表',
        required: true,
        fields: [
          ['product', '产品/服务', '写具体卖什么。'],
          ['audience', '目标人群', '选择购买人群', ['新手用户', '价格敏感人群', '品质需求人群', '宝妈/家庭用户', '跨境消费者', '本地客户']],
          ['scene', '购买场景', '选择购买场景', ['刚需补货', '节日送礼', '解决痛点', '尝鲜种草', '直播冲动购买']],
          ['sellingPoint', '核心卖点', '选择主卖点', ['效果', '价格', '特色', '质量', '案例', '服务']],
          ['proof', '证明材料', '写评价、案例、检测、过程或达人素材。', null, { required: false }],
        ],
      },
    ],
    generateLabel: '生成带货方案',
  },
];

export const moduleMap = Object.fromEntries(modules.map((item) => [item.id, item]));
