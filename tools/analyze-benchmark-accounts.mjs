import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const rawDir = path.join(root, 'outputs', 'account_full_analysis', 'raw');
const outDir = path.join(root, 'outputs', 'account_full_analysis');
const structuredPath = path.join(root, 'knowledge', 'structured-blocks.json');

const accountNotes = {
  H001: {
    direction: '本地美业老板IP',
    domain: '美业同城流量/实体店老板',
    nameFormula: '个人昵称，降低距离感；不把服务名放满，靠主页简介补定位。',
    introAnalysis: '简介同时交代身份、行业和方法资产：研究生、美业、自媒体人、同城流量打法。适合建立“自己做过，也能教别人做”的复合权威。',
    copyPattern: '标题高频使用自我成长、学员、实体店流量、行业场景，一边做人设，一边给同城商家可复制拍法。',
    visualPattern: '真人头像和人物封面强，封面大字醒目，穿插活动、学员、门店和生活场景，形成“活人感 + 组织势能”。',
    trustAssets: '公司认证、粉丝量、学员、活动现场、同城流量经验。',
    conversionPath: '私信、课程/陪跑、实体店流量服务。',
    motherMethodsVerified: ['真实人设放大', '场景化信任', '学员/客户证明', '低门槛同城老板可复制'],
    newMethod: '同城美业“活人感教学IP”：先让老板相信你是鲜活的人，再相信你的方法能落地。',
    missing: '需补充代表爆款逐字稿、评论区关键词和私域承接话术。'
  },
  H002: {
    direction: '本地美甲店老板IP',
    domain: '美甲/美睫到店与招聘',
    nameFormula: '“小日记 + 招美甲师”直接把账号内容形态和招聘需求放进名字。',
    introAnalysis: '简介把年龄、城市、梦想中的店、长期招优秀美甲美睫师写清楚，商业目标非常前置。',
    copyPattern: '大量“第一视角”“工作日常”“千元美甲店”“顾客治愈”标题，用忙碌和客单价做非金钱炫富。',
    visualPattern: '封面以店内工作、手部成品、人物自拍和顾客互动为主，画面真实、明亮、偏日记感。',
    trustAssets: '店铺真实工作量、千元美甲、顾客礼物、忙碌状态、粉丝量。',
    conversionPath: '到店消费、私信预约、招聘优秀美甲美睫师。',
    motherMethodsVerified: ['真实过程证明', '非金钱炫富', '顾客关系证明', '人设即招聘'],
    newMethod: '服务业忙碌炫富：不直接晒收入，晒忙、晒顾客、晒客单价，让同行和客户同时被吸引。',
    missing: '需补代表视频脚本，确认招聘和客户转化哪个优先。'
  },
  H003: {
    direction: '变美技术老师IP',
    domain: '男士眉/线下课/视觉美学',
    nameFormula: '“眉毛日记 + 开课时间”明确内容资产和转化窗口。',
    introAnalysis: '简介直接写线下课、初阶/高阶/全科，并把“成都街头抓人改眉毛”做成连续挑战。',
    copyPattern: '标题突出“无眉男生”“街头抓路人”“第52天”“前后对比”，用连续栏目和结果反差促留存。',
    visualPattern: '封面大量前后对比、人脸近景、素人改造，视觉证据比口播更强。',
    trustAssets: '连续挑战、真实路人、前后对比、课程开课信息。',
    conversionPath: '线下课、私信咨询、技术学习。',
    motherMethodsVerified: ['第一句结果前置', '场景化信任', '高价值信号外显', '连续栏目冷启动'],
    newMethod: '技术服务“街头挑战证明”：用陌生人的即时改变证明技术，不靠自夸。',
    missing: '需补课程成交路径和评论关键词。'
  },
  H004: {
    direction: '美业账号诊断/新流量老师',
    domain: '美容院短视频教学',
    nameFormula: '“城市/区域 + 爱做脸”很生活化，名字亲切但简介补专业。',
    introAnalysis: '简介强调美业实战十年和新流量，定位为美业老板的同城视频教练。',
    copyPattern: '标题多用“同城视频怎么拍”“帮粉丝做账号”“美业大检查”，以诊断和实操教学承接。',
    visualPattern: '封面大字、黑底黄字多，人物口播和账号诊断截图结合，工具感强。',
    trustAssets: '十年实战、帮粉丝做账号、案例诊断。',
    conversionPath: '私信咨询、账号诊断、课程/陪跑。',
    motherMethodsVerified: ['专业判断标准', '场景化教学', '案例诊断信任'],
    newMethod: '美业诊断型IP：不是只教知识，而是公开帮同行改账号，降低咨询门槛。',
    missing: '需补诊断视频的完整结构。'
  },
  H005: {
    direction: '美学主理人IP',
    domain: '眉眼设计/定妆/高级审美',
    nameFormula: '品牌名 + 个人名，兼顾机构资产和个人记忆点。',
    introAnalysis: '简介强调主理人、11年品牌深耕、产品经理、无自测，突出审美与产品方法。',
    copyPattern: '标题偏“高级感”“面部构造”“淡颜系”“光影建骨架”，用审美判断制造专业差异。',
    visualPattern: '封面多为女性脸部近景、前后对比和审美关键词，整体更精致。',
    trustAssets: '11年经验、品牌主理人、审美体系、真实客户反馈。',
    conversionPath: '到店咨询、审美服务、课程/品牌服务。',
    motherMethodsVerified: ['专业判断标准', '高价值信号外显', '结果可视化'],
    newMethod: '审美型IP不要只讲效果，要讲“为什么这样才高级”的判断体系。',
    missing: '需补成交型视频和客户转化话术。'
  },
  H006: {
    direction: '高审美生活方式IP',
    domain: '美妆/穿搭/生活方式/品牌合作',
    nameFormula: '中文名 + 英文记忆符号，形成强个人品牌。',
    introAnalysis: '主页更偏名人/高品位人格资产，简介信息较少，依靠长期内容和审美一致性建立权威。',
    copyPattern: '标题围绕米兰、英文诗、护肤彩妆、旅行、阅读与生活品位，卖的是“跟随她的品位”。',
    visualPattern: '封面统一审美，高质感人物和生活场景，少强销售，多氛围和品味背书。',
    trustAssets: '高粉丝量、长期审美一致性、全球生活方式、品牌合作感。',
    conversionPath: '品牌合作、种草、产品信任迁移。',
    motherMethodsVerified: ['人设资产沉淀', '高价值信号外显', '场景化信任'],
    newMethod: '品位型IP：信任不是来自“我专业”，而是来自“我长期选择都高级”。',
    missing: '需补具体带货/合作转化案例。'
  },
  H007: {
    direction: '短视频训练中心老板IP',
    domain: '短视频运营/达人训练/代运营',
    nameFormula: '个人昵称有反差感，简介用机构名和老板身份补专业。',
    introAnalysis: '简介直接写Allin短视频达人训练中心老板，并用“白嫖免开尊口”筛选客户。',
    copyPattern: '标题常用创业故事、学员变强、账号系列、老板怎么拍，兼顾观点、人设和教学。',
    visualPattern: '封面人物口播、课堂/舞台/客户场景结合，大字提示商业结果。',
    trustAssets: '训练中心、学员案例、老板身份、长期账号拆解。',
    conversionPath: '课程、训练营、代运营、咨询。',
    motherMethodsVerified: ['学员结果证明', '真实人设放大', '筛选型表达'],
    newMethod: '知识付费账号要敢筛选：把“不适合谁”说出来，反而提高成交质量。',
    missing: '需补私域承接和课程成交漏斗。'
  },
  H008: {
    direction: 'AI商业/超级个体IP',
    domain: 'AI商业落地/一人公司',
    nameFormula: '个人姓名 + 版本号，强化迭代感和连续关注。',
    introAnalysis: '简介用清华博士、一人公司、AI商业落地、超级个体等高势能词建立权威。',
    copyPattern: '标题围绕机会、赚钱思维、商业经历、底层逻辑，直接承接老板和个体创业者焦虑。',
    visualPattern: '封面多为人物口播 + 大字观点，专业但偏知识博主化。',
    trustAssets: '清华博士、公司认证、粉丝体量、商业经历。',
    conversionPath: '课程、社群、咨询、AI工具/服务。',
    motherMethodsVerified: ['高势能身份', '认知差选题', '趋势机会钩子'],
    newMethod: '趋势型IP要把未来机会翻译成普通人当下能理解的行动。',
    missing: '需补成交页/课程产品信息。'
  },
  H009: {
    direction: '企业流量增长IP',
    domain: '企业流量/实体获客/电商创业',
    nameFormula: '品牌名 + 老吴 + 企业流量增长，个人称呼和结果承诺同时出现。',
    introAnalysis: '简介用企业流量军师、助力企业流量增长、赋能提效，定位老板人群。',
    copyPattern: '标题喜欢用创业十年、救赎、靠自己、大哥带你等强人性观点，击中老板孤独和被骗焦虑。',
    visualPattern: '封面大字密集、人物近景多，情绪和观点强，系列感明显。',
    trustAssets: '粉丝体量、长期作品量、企业增长定位、创业叙事。',
    conversionPath: '企业服务、咨询、课程/陪跑。',
    motherMethodsVerified: ['受众底层洞察', '人性观点借鉴', '老板焦虑转译'],
    newMethod: '企业服务IP先讲老板的人性困境，再讲方法，咨询转化更顺。',
    missing: '需补高咨询视频和转化链路。'
  },
  H010: {
    direction: '电商管理咨询IP',
    domain: '电商管理/老板组织提效',
    nameFormula: '个人名 + 电商管理咨询，搜索和转化都直接。',
    introAnalysis: '简介直接给私信关键词“666”、领资料、进群，承接路径非常明确。',
    copyPattern: '标题用“管理者一定要闲”“高工资前提是高标准”等反常识管理判断。',
    visualPattern: '封面统一人物口播和大字标题，职业感强。',
    trustAssets: '公司认证、直播中、资料领取、管理咨询定位。',
    conversionPath: '私信关键词、资料、进群、咨询。',
    motherMethodsVerified: ['评论/私信关键词承接', '反常识观点', '高客单咨询漏斗'],
    newMethod: '知识付费/咨询最短路径：主页简介直接写关键词动作，减少用户犹豫。',
    missing: '需补私域SOP和资料包结构。'
  },
  H011: {
    direction: '成交文案/IP+AI课程IP',
    domain: '成交文案/老板IP/AI短视频获客',
    nameFormula: '强符号昵称 + 峰会时间，名字天然制造事件感。',
    introAnalysis: '简介清楚写产品是线下课，主题是IP+AI、成交文案、人设定位。',
    copyPattern: '标题用车祸使命、流量文案VS变现文案、学员整理，强调转折和结果。',
    visualPattern: '封面有强对比大字、课程/人物/白板场景，商业培训感强。',
    trustAssets: '线下课、峰会、学员、课程主题明确。',
    conversionPath: '线下课、峰会、私域咨询。',
    motherMethodsVerified: ['事件型转化', '学员证明', '成交文案定位'],
    newMethod: '课程IP可用“时间节点/峰会”把普通内容变成当下必须行动的事件。',
    missing: '需补峰会转化页和直播/私域承接。'
  },
  H012: {
    direction: '广告/认知老师IP',
    domain: '广告策略/人生战略/认知成长',
    nameFormula: '强记忆昵称，简介补“广告鬼才”和畅销书作者。',
    introAnalysis: '简介强调借势、主角、从业30年，用资历和概念词建立独特方法论。',
    copyPattern: '标题常用同情心漏洞、投名状、人生战略、钱如何分，强人性强拆解。',
    visualPattern: '封面基本统一人物近景 + 大字观点，强调老江湖和智慧感。',
    trustAssets: '30年从业、畅销书作者、独立概念体系。',
    conversionPath: '书、课程、咨询、社群。',
    motherMethodsVerified: ['人性洞察', '观点IP', '强概念资产'],
    newMethod: '成熟专家IP要沉淀自己的词库，词就是品牌资产。',
    missing: '需补产品承接和付费路径。'
  },
  H013: {
    direction: '商业认知/老板圈层IP',
    domain: '企业家联盟/认知/人性',
    nameFormula: '借用强IP参哥 + 个人名诗亿，降低冷启动信任成本。',
    introAnalysis: '简介信息较少，但标题不断强调企业家联盟、老板成功失败、商业周期。',
    copyPattern: '标题直接说“生意不好做”“破产率最高”“老板致命错误”，高度匹配工程老板等群体的人性和翻身焦虑。',
    visualPattern: '封面口播、老板访谈、出行场景都有，强化圈层和见识。',
    trustAssets: '公司认证、老板联盟、参哥背书、企业家案例。',
    conversionPath: '老板圈层、课程、咨询/服务。',
    motherMethodsVerified: ['跨行业借鉴', '受众底层洞察', '人性/商业逻辑迁移'],
    newMethod: '跨行业借内容的前提不是行业相同，而是受众底层欲望相同。',
    missing: '需补具体爆款文案与工程律师改编样本。'
  },
  H014: {
    direction: '商业咨询头部IP',
    domain: '商业模式/新增长/课程',
    nameFormula: '姓名 + 商业咨询，强搜索定位。',
    introAnalysis: '简介直接引导商品领取官方课程，定位新商业/新趋势/新增长。',
    copyPattern: '标题用行业事件和宏观趋势切入，如茅台竞争对手、快递退市、新旧世界分水岭。',
    visualPattern: '封面统一专家头像和大字观点，强品牌化、强课程化。',
    trustAssets: '超大粉丝量、课程商品、商业咨询标签。',
    conversionPath: '商品课程、私域、咨询。',
    motherMethodsVerified: ['趋势观点', '高势能专家', '课程承接'],
    newMethod: '头部商业IP把热点事件解释成老板该懂的底层规律。',
    missing: '需补短视频到课程的具体链路。'
  },
  H031: {
    direction: '装修避坑专家IP',
    domain: '装修干货/直播咨询',
    nameFormula: '海哥 + 用心讲装修，亲切称呼加专业方向。',
    introAnalysis: '简介写500套房实践经验和每天两场直播，证明实战和稳定承接。',
    copyPattern: '标题多为“8个细节”“十条小细节”“7点做不出错”，清单化强。',
    visualPattern: '封面以装修现场、人物讲解、细节标注为主，黄字大标题突出避坑。',
    trustAssets: '500套实践、直播频率、装修细节清单。',
    conversionPath: '直播、咨询、装修服务/推荐。',
    motherMethodsVerified: ['专业判断标准', '风险痛点', '现场证据'],
    newMethod: '装修类最稳结构是“空间场景 + 数字清单 + 避坑理由”。',
    missing: '需补直播承接话术。'
  },
  H032: {
    direction: '装修内幕揭露IP',
    domain: '室内设计/建材避坑',
    nameFormula: '个人名 + 室内设计，简介用“实名制揭内幕”建立差异。',
    introAnalysis: '简介“我现在粉丝少我可啥都说”制造真实和敢说的关系。',
    copyPattern: '标题围绕主材、软装、建材、家电验收，强调选择和验收标准。',
    visualPattern: '人物口播封面强，大字贴近具体建材，像现场导购避坑。',
    trustAssets: '公司认证、揭内幕定位、建材选择标准。',
    conversionPath: '关注、咨询、设计/装修服务。',
    motherMethodsVerified: ['敢说真话人设', '专业判断标准', '风险提醒'],
    newMethod: '内幕型IP要先建立“我站在你这边”，再输出判断标准。',
    missing: '需补高转化视频和评论区。'
  },
  H033: {
    direction: '装修公司/设计师IP',
    domain: '上海装修/老房翻新',
    nameFormula: '昵称 + 装修设计，简介用宝妈设计师和12年经验做人设。',
    introAnalysis: '简介把城市、身份、经验、审美理念写清楚，适合同城高信任服务。',
    copyPattern: '标题讲内部流程、恶意增项、老房翻新、尺寸图，既讲信任又给实用。',
    visualPattern: '封面多施工现场、设计师出镜、黄字重点，强调流程透明。',
    trustAssets: '12年经验、公司认证、内部流程、产业工人改革。',
    conversionPath: '同城装修咨询、量房、设计服务。',
    motherMethodsVerified: ['过程透明信任', '专业判断标准', '同城服务承接'],
    newMethod: '高客单服务要公开流程，流程本身就是信任资产。',
    missing: '需补咨询转化路径和成交异议。'
  },
  H034: {
    direction: '装修日记/业主IP',
    domain: '自家装修/家居分享',
    nameFormula: '“装修日记”天然适合连续追更，降低专业压迫感。',
    introAnalysis: '简介写顶楼复式装修中、避坑经验、家居分享、资料分享，角色是亲历者。',
    copyPattern: '标题故事性强：省房申请出战、悲剧故事、远嫁和家的形成，把装修变成情绪内容。',
    visualPattern: '封面以真实家、露台、装修成果、图文感为主，审美和故事并重。',
    trustAssets: '真实自家装修、长期过程记录、资料分享、强爆款。',
    conversionPath: '资料、家居种草、合作、私域。',
    motherMethodsVerified: ['真实过程记录', '故事化选题', '结果可视化'],
    newMethod: '业主IP不是专家也能起量：真实过程 + 情绪故事 + 可抄作业。',
    missing: '需补商品/资料承接方式。'
  },
  H035: {
    direction: '宠物医院/宠物知识IP',
    domain: '宠物医疗/养猫避坑',
    nameFormula: '“怕老婆的豆哥”强人设，后缀“好好宠医”补商业与机构。',
    introAnalysis: '简介用幽默关系建立亲近感，再交代11年猫粮批发和开宠物医院。',
    copyPattern: '标题多为“慢性虐猫”“300预算足够”“好意可能害猫”，强风险提醒。',
    visualPattern: '封面有宠物、人物、黄字/彩色大字，既可爱又有警示。',
    trustAssets: '宠物医院认证、11年行业经历、预算建议、误区科普。',
    conversionPath: '到店、咨询、宠物产品/服务。',
    motherMethodsVerified: ['风险痛点', '服务者关系', '真实人设'],
    newMethod: '宠物IP要把“爱宠”翻译成“别用错方法害它”的风险提醒。',
    missing: '需补医院到店转化视频。'
  },
  H036: {
    direction: '宠物测评IP',
    domain: '猫粮狗粮测评/科学养宠',
    nameFormula: '昵称 + 养宠，简单直接。',
    introAnalysis: '简介写认真科普、严格测评、经常给粉丝送，建立测评公信力。',
    copyPattern: '标题大量“热门狗粮测评”“一句话总结”“十大国产猫粮”，强收藏导向。',
    visualPattern: '封面产品包装密集、榜单感强，信息量大。',
    trustAssets: '测评体系、产品横评、粉丝福利。',
    conversionPath: '种草、带货、粉丝福利、私域。',
    motherMethodsVerified: ['判断标准', '收藏型内容', '产品可视化'],
    newMethod: '测评IP的爆款来自“替用户做选择”，不是单纯介绍产品。',
    missing: '需补带货成交数据和选品逻辑。'
  },
  H044: {
    direction: '工程律师对标IP',
    domain: '重大疑难工程纠纷',
    nameFormula: '姓名 + 专注工程难案，专业定位极清楚。',
    introAnalysis: '简介写18年办案经验、重大疑难工程纠纷、全国接案，偏专业权威。',
    copyPattern: '标题是“尽头就是打官司”“不能只懂法条”“不是有道理就能赢”，强调行业现实判断。',
    visualPattern: '封面多律师出镜、工程老板、案例词和结果词，专业感比江湖感更强。',
    trustAssets: '18年经验、团队、全国接案、工程难案定位。',
    conversionPath: '私信/电话/咨询。',
    motherMethodsVerified: ['专业判断标准', '行业现实', '工程老板痛点'],
    newMethod: '工程律师另一条路线：少江湖情绪，多行业现实和专业判断。',
    missing: '需与吾天账号逐条对比转化效率。'
  },
  H045: {
    direction: '工程律师团队IP',
    domain: '建筑企业工程欠款/执行回款',
    nameFormula: '工程律师 + 姓名，搜索意图强。',
    introAnalysis: '简介强调专注大中型建筑企业工程欠款，擅长大宗案件，客户门槛清晰。',
    copyPattern: '标题多讲团队、办案区域、全国工程老板为什么找我们执行工程款，突出团队和执行能力。',
    visualPattern: '封面有律所环境、团队、证据文件和口播，信任资产偏硬。',
    trustAssets: '律师认证、团队、办案区域、大宗执行回款。',
    conversionPath: '电话/私信咨询、律所来访。',
    motherMethodsVerified: ['团队信任', '高价值案件证明', '专业服务承接'],
    newMethod: '律师账号如果不走强情绪，就必须把团队、区域、执行能力拍成证据。',
    missing: '需补咨询起量视频和私信话术。'
  },
  H047: {
    direction: 'AI跨境/服务商IP',
    domain: 'AI SaaS/TikTok跨境/东南亚电商',
    nameFormula: '超哥 + AI跨境，亲切称呼加赛道关键词。',
    introAnalysis: '简介写All in AI、AIsaas平台创始人，定位趋势型服务商。',
    copyPattern: '标题用东南亚卖家利润、AIGC时代、好产品+好IP、国际大使来访，融合趋势和实力证明。',
    visualPattern: '封面有会议、团队、跨境场景和口播，商业背书感强。',
    trustAssets: '公司认证、平台创始人、国际访问、跨境趋势。',
    conversionPath: 'SaaS平台、跨境服务、咨询。',
    motherMethodsVerified: ['趋势机会钩子', '场景化信任', '高价值信号外显'],
    newMethod: '跨境服务商要把“趋势”拍成“我已经在场”的证据。',
    missing: '需补具体服务产品和客户案例。'
  },
  H067: {
    direction: '变美/审美闺蜜IP',
    domain: '素人改造/美商',
    nameFormula: '昵称化，简介用电子闺蜜账号矩阵补角色。',
    introAnalysis: '简介把“电子闺蜜”“美商版”等矩阵账号写出，关系定位非常强。',
    copyPattern: '标题高频“把普女捏成杭州阿娇/天仙姐姐/女团门面”，结果前置且有强画面。',
    visualPattern: '封面大量女生脸部、改造前后、闺蜜场景，结果冲击强。',
    trustAssets: '素人改造结果、审美判断、账号矩阵。',
    conversionPath: '审美服务、课程、咨询、账号矩阵导流。',
    motherMethodsVerified: ['结果前置', '真实关系人设', '高价值信号外显'],
    newMethod: '变美IP最强钩子是“把普通人变成谁”，用结果类比降低理解成本。',
    missing: '需补服务承接方式。'
  },
  H068: {
    direction: '比例美学专家IP',
    domain: '面部比例/自然美学/教育',
    nameFormula: '小羽毛 + 比例美学，昵称亲切但专业关键词明确。',
    introAnalysis: '简介强调全网400w+、头部变美博主、名人名流私人服务，势能很高。',
    copyPattern: '标题讲面部平衡、头包脸、妈感、看脸分析，用审美术语建立专家判断。',
    visualPattern: '封面更精致，脸部特写和明星/名人感强，专业审美大于生活日记。',
    trustAssets: '全网粉丝、名人名流、机构认证、比例美学体系。',
    conversionPath: '美学教育、咨询、课程/服务。',
    motherMethodsVerified: ['高势能身份', '专业判断标准', '审美体系'],
    newMethod: '高端审美IP要把“感觉漂亮”拆成可命名的比例规则。',
    missing: '需补课程/服务成交链路。'
  },
  H069: {
    direction: '工厂老板IP',
    domain: '电气/高低压成套设备/代工厂',
    nameFormula: '海鸥姐 + 浙江电气，亲切人格加地域行业。',
    introAnalysis: '简介有诗句、个人名、深耕电气行业，既有人设又有行业纵深。',
    copyPattern: '标题用七位数展厅、做什么介绍、因为经历所以努力，晒工厂资产和创业故事。',
    visualPattern: '封面大量工厂、展厅、老板出镜、产品现场，供应链证据很强。',
    trustAssets: '公司认证、七位数展厅、产品线、工厂现场。',
    conversionPath: 'B端询盘、合作、供应链采购。',
    motherMethodsVerified: ['非金钱炫富', '场景化信任', '老板真实经历'],
    newMethod: '工厂IP的炫富不是豪车，而是展厅、机器、库存、工厂规模和老板投入。',
    missing: '需补B端询盘转化话术。'
  },
  H070: {
    direction: '家居定制工厂IP',
    domain: '全屋定制/工厂直播/供应链',
    nameFormula: '品牌名 + 家居定制，简介用“一姐”强化人物记忆。',
    introAnalysis: '简介写直播时间、10万级空间/工厂线索，商业承接直接。',
    copyPattern: '标题用2亿工厂、5000㎡展厅、员工花园、人情味，规模和企业文化同时外显。',
    visualPattern: '封面工厂、展厅、老板/员工场景多，强实体资产证明。',
    trustAssets: '品牌授权、直播时间、2亿工厂、5000㎡展厅。',
    conversionPath: '直播、全屋定制咨询、工厂合作。',
    motherMethodsVerified: ['高价值信号外显', '场景化信任', '直播承接'],
    newMethod: '品牌工厂IP要把“规模”拍成可见空间，把“人情味”拍成信任温度。',
    missing: '需补直播成交结构。'
  }
};

const methodBlocks = [
  {
    id: 'ip-benchmark-local-beauty-living-proof',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'viral-topics', 'script', 'conversion-topics'],
    title: '对标方法：本地美业活人感与同城证明',
    methods: ['活人感出镜', '同城流量打法', '门店过程证明', '学员/客户证明', '第一视角工作日常', '服务业忙碌炫富'],
    scenarios: ['本地美业老板IP', '美甲美睫', '美容院', '团购券到店', '美业课程'],
    requiredInputs: ['城市/区域', '门店或工作室现场', '服务项目', '客单价或忙碌证据', '客户评价', '预约/私信/团购入口'],
    outputTemplate: ['人设定位', '同城信任资产', '可拍过程', '结果证明', '日记型选题', '成交入口'],
    example: '美业账号不要只说技术好，要拍店里真实忙碌、顾客互动、改造前后、学员现场和老板本人情绪。千元美甲、满房预约、顾客送礼、学员活动都属于非金钱炫富。',
    keywords: ['美业', '同城', '活人感', '门店', '第一视角', '工作日常', '千元美甲', '学员', '顾客', '团购券', '到店', '忙碌炫富']
  },
  {
    id: 'ip-benchmark-beauty-transformation-proof',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'viral-topics', 'script', 'viral-analysis'],
    title: '对标方法：变美IP结果前置与前后对比',
    methods: ['素人改造', '前后对比', '街头挑战', '结果类比', '审美判断标准', '连续栏目'],
    scenarios: ['变美IP', '眉眼设计', '面部美学', '素人改造', '审美课程'],
    requiredInputs: ['可展示的改造前后', '改造对象', '审美判断标准', '可连续拍摄的栏目', '服务或课程入口'],
    outputTemplate: ['第一句结果', '对比证据', '审美原因', '过程镜头', '用户反应', '承接方式'],
    example: '把普女捏成杭州阿娇、街头抓路人改眉毛、无眉男生改造，这类内容先给结果想象，再用前后对比证明技术。',
    keywords: ['变美', '素人改造', '前后对比', '街头挑战', '眉毛', '审美', '比例美学', '结果前置', '连续栏目']
  },
  {
    id: 'ip-benchmark-course-private-domain',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'conversion-topics', 'script'],
    title: '对标方法：课程IP强观点与私域关键词承接',
    methods: ['强观点开头', '学员结果证明', '私信关键词', '资料包引流', '线下课事件化', '筛选型表达'],
    scenarios: ['知识付费IP', '短视频培训', '电商管理咨询', '成交文案课程', 'AI商业课程'],
    requiredInputs: ['课程产品', '目标学员', '学员案例', '私信关键词', '资料包', '课程时间或峰会节点'],
    outputTemplate: ['观点钩子', '为什么错', '学员/案例证明', '方法框架', '关键词CTA', '进群/课程承接'],
    example: '简介直接写“私信输入666领资料进群”，视频里用反常识观点筛选用户，再用学员结果和线下课时间促成行动。',
    keywords: ['课程IP', '私信关键词', '666', '资料', '进群', '学员', '训练营', '线下课', '峰会', '成交文案', '筛选客户']
  },
  {
    id: 'ip-benchmark-business-cognition-humanity',
    category: 'personal_ip',
    moduleIds: ['viral-topics', 'script', 'viral-analysis', 'rewrite'],
    title: '对标方法：商业认知内容的人性迁移',
    methods: ['人性洞察', '老板焦虑', '商业周期', '认知差', '跨行业借鉴', '强概念词库'],
    scenarios: ['老板IP', '商业咨询', '企业服务', '工程老板内容改编', '认知类账号'],
    requiredInputs: ['目标受众的底层欲望', '恐惧和翻身焦虑', '可借鉴跨行业内容', '本行业事实', '承接产品'],
    outputTemplate: ['人性判断', '行业事实替换', '老板痛点', '案例或故事', '商业逻辑', '行动建议'],
    example: '参哥认知圈、商业咨询类内容能被工程律师借鉴，不是因为行业相同，而是工程老板同样关心关系、利益、翻身、破产、时代红利和人性。',
    keywords: ['商业认知', '人性', '老板', '翻身焦虑', '关系', '利益', '跨行业借鉴', '认知差', '商业周期', '低粉爆款']
  },
  {
    id: 'ip-benchmark-renovation-risk-checklist',
    category: 'personal_ip',
    moduleIds: ['pain-topics', 'viral-topics', 'script', 'conversion-topics'],
    title: '对标方法：装修避坑的现场清单结构',
    methods: ['空间场景', '数字清单', '避坑理由', '验收标准', '内部流程公开', '现场证据'],
    scenarios: ['装修IP', '设计师IP', '家居服务', '老房翻新', '高客单本地服务'],
    requiredInputs: ['具体空间', '用户怕踩的坑', '可展示现场', '判断标准', '报价/增项风险', '咨询入口'],
    outputTemplate: ['空间问题', '数字清单', '错误后果', '正确标准', '现场证明', '咨询CTA'],
    example: '厨房装修记住十条、水电改造8个细节、老房装修恶意增项，这些标题把复杂服务变成可收藏的判断清单。',
    keywords: ['装修', '避坑', '水电', '厨房', '主材', '软装', '验收', '老房翻新', '恶意增项', '流程透明', '清单']
  },
  {
    id: 'ip-benchmark-owner-diary-process-story',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'viral-topics', 'script'],
    title: '对标方法：业主日记与真实过程故事',
    methods: ['装修日记', '真实过程', '情绪故事', '可抄作业', '资料分享', '家作为结果证明'],
    scenarios: ['业主IP', '家居种草', '生活方式IP', '非专家个人IP'],
    requiredInputs: ['真实项目周期', '过程节点', '踩坑和遗憾', '成果图', '可分享资料', '合作或私域入口'],
    outputTemplate: ['当前阶段', '情绪冲突', '过程证据', '踩坑经验', '最终效果', '资料/产品承接'],
    example: '一口的装修日记用真实顶楼复式过程、远嫁和家的故事，把装修内容从专业讲解变成可追更的情绪资产。',
    keywords: ['装修日记', '业主', '真实过程', '顶楼', '露台', '家的样子', '可抄作业', '资料分享', '过程故事']
  },
  {
    id: 'ip-benchmark-pet-risk-evaluation',
    category: 'combined',
    moduleIds: ['pain-topics', 'viral-topics', 'script', 'commerce'],
    title: '对标方法：宠物风险提醒与测评替用户决策',
    methods: ['风险提醒', '误区纠正', '预算建议', '横向测评', '一句话总结', '替用户做选择'],
    scenarios: ['宠物医生IP', '宠物用品带货', '猫粮狗粮测评', '宠物医院到店'],
    requiredInputs: ['宠物类型', '新手误区', '风险后果', '产品/服务证据', '测评标准', '到店或商品入口'],
    outputTemplate: ['错误行为', '后果风险', '正确标准', '预算/选择建议', '证明镜头', '转化入口'],
    example: '宠物内容不要只说可爱，要指出“你的好意可能害猫”“300预算足够用”“一句话总结国产猫粮”，帮助用户减少决策风险。',
    keywords: ['宠物', '养猫', '养狗', '风险提醒', '误区', '预算', '猫粮', '狗粮', '测评', '宠物医院', '替用户选择']
  },
  {
    id: 'ip-benchmark-lawyer-professional-judgment',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'pain-topics', 'script', 'conversion-topics'],
    title: '对标方法：工程律师专业判断与团队证据路线',
    methods: ['行业现实判断', '工程难案定位', '团队证据', '执行回款', '办案区域', '专业权威路线'],
    scenarios: ['工程律师IP', '专业服务IP', '高客单咨询', '律师团队账号'],
    requiredInputs: ['办案经验', '团队资产', '案件类型', '客户身份', '执行/回款能力', '电话或私信入口'],
    outputTemplate: ['行业现实', '为什么难', '专业判断', '团队/区域证据', '客户适配', '咨询CTA'],
    example: '李泳霄、黄秀敏这类工程律师账号验证了另一条路线：不一定强江湖气，也可以用18年经验、工程难案、团队、办案区域和执行回款建立信任。',
    keywords: ['工程律师', '工程款', '工程纠纷', '工程难案', '执行回款', '团队', '办案区域', '行业现实', '专业判断']
  },
  {
    id: 'ip-benchmark-factory-boss-supply-chain-proof',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'viral-topics', 'script', 'conversion-topics'],
    title: '对标方法：工厂老板供应链资产炫富',
    methods: ['工厂现场', '展厅规模', '设备库存', '老板投入', '企业文化', '直播承接'],
    scenarios: ['工厂老板IP', 'B端供应链', '家居定制', '电气设备', '实体老板IP'],
    requiredInputs: ['工厂/展厅面积', '设备或库存', '投入金额', '产品线', '老板故事', '询盘/直播入口'],
    outputTemplate: ['第一句规模信号', '现场镜头', '产品证明', '老板投入', '合作理由', '询盘CTA'],
    example: '工厂IP的炫富不是豪车，而是七位数展厅、2亿工厂、5000平实景展厅、产品线、机器和员工场景。',
    keywords: ['工厂', '老板IP', '展厅', '供应链', '七位数', '2亿工厂', '5000㎡', '全屋定制', '电气', 'B端询盘']
  },
  {
    id: 'ip-benchmark-cross-border-ai-trend-proof',
    category: 'personal_ip',
    moduleIds: ['ip-positioning', 'viral-topics', 'script', 'conversion-topics'],
    title: '对标方法：跨境AI趋势服务商的在场证明',
    methods: ['趋势机会', '平台创始人', '国际场景', '团队/会议证明', '服务商信任', '好产品+好IP'],
    scenarios: ['跨境电商IP', 'TikTok服务商', 'AI SaaS', '企业服务IP'],
    requiredInputs: ['目标市场', '趋势机会', '平台/服务产品', '客户或场景证明', '团队资产', '咨询入口'],
    outputTemplate: ['趋势判断', '为什么现在', '在场证据', '服务能力', '客户收益', '咨询CTA'],
    example: 'AI跨境服务商不能只讲风口，要拍东南亚卖家利润、国际访问、团队会议、平台能力，让用户相信你已经在局里。',
    keywords: ['AI跨境', 'TikTok Shop', '东南亚电商', '服务商', 'AIsaas', '平台创始人', '趋势', '在场证明', '好产品好IP']
  }
];

function readRaw(id) {
  return fs.readFile(path.join(rawDir, `${id}.json`), 'utf8')
    .then((text) => JSON.parse(text.replace(/^\uFEFF/, '')));
}

function getLines(text = '') {
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function extractProfile(lines) {
  const name = firstAfterNoise(lines);
  const followers = valueAfter(lines, '粉丝');
  const likes = valueAfter(lines, '获赞');
  const works = valueAfter(lines, '作品');
  const douyinId = lines.find((line) => line.startsWith('抖音号：')) || '';
  const ip = lines.find((line) => line.startsWith('IP属地：')) || '';
  const introIndex = lines.findIndex((line) => line.startsWith('抖音号：'));
  const introCandidates = introIndex >= 0 ? lines.slice(introIndex + 1, introIndex + 8) : [];
  const intro = introCandidates
    .filter((line) => !line.startsWith('IP属地：') && !/^\d+岁$/.test(line) && !['男', '女', '更多', '关注', '私信'].includes(line) && !line.includes('·'))
    .slice(0, 2)
    .join(' ');
  return { name, followers, likes, works, douyinId, ip, intro };
}

function firstAfterNoise(lines) {
  const noise = new Set(['开启读屏标签', '读屏标签已关闭', '精选', '推荐', '搜索', '关注', '朋友', '我的', '直播', '放映厅', '短剧', '小游戏', '充钻石', '客户端', '壁纸', '通知', '消息', '投稿']);
  const idx = lines.findIndex((line) => line === '投稿');
  const rest = idx >= 0 ? lines.slice(idx + 1) : lines;
  return rest.find((line) => !noise.has(line) && !/^\d+$/.test(line)) || '';
}

function valueAfter(lines, label) {
  const idx = lines.findIndex((line) => line === label);
  if (idx <= 0) return '';
  return lines[idx - 1] || '';
}

function extractTitles(lines) {
  const noise = new Set(['开启读屏标签', '读屏标签已关闭', '精选', '推荐', '搜索', '关注', '朋友', '我的', '直播', '放映厅', '短剧', '小游戏', '充钻石', '客户端', '壁纸', '通知', '消息', '投稿', '更多', '私信', '作品', '喜欢', '合集', '短剧', '日期筛选', '搜索 Ta 的作品', '置顶', '共创']);
  return lines
    .filter((line) => !noise.has(line))
    .filter((line) => line.length >= 12)
    .filter((line) => /#|？|！|，|。|“|”|怎么|为什么|一定|老板|装修|美|猫|狗|工程|AI|商业|流量|工厂|展厅/.test(line))
    .slice(0, 8);
}

function markdownTable(rows) {
  const headers = ['编号', '账号', '方向', '名字/简介', '文案模式', '画面模式', '验证母方法', '新增方法'];
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${[
      row.id,
      row.accountName,
      row.direction,
      `${row.nameFormula}<br>${row.introAnalysis}`,
      row.copyPattern,
      row.visualPattern,
      row.motherMethodsVerified.join('、'),
      row.newMethod,
    ].map(escapeCell).join(' | ')} |`);
  }
  return lines.join('\n');
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '/').replace(/\n/g, '<br>');
}

function buildMethodSummary(rows) {
  const groups = {};
  for (const row of rows) {
    groups[row.domain] ||= [];
    groups[row.domain].push(row);
  }
  return Object.entries(groups).map(([domain, items]) => ({
    domain,
    count: items.length,
    coreFinding: summarizeDomain(domain),
    accounts: items.map((item) => `${item.id} ${item.accountName}`),
  }));
}

function summarizeDomain(domain) {
  if (domain.includes('美业') || domain.includes('美甲') || domain.includes('美学') || domain.includes('变美')) return '美业和变美类共同点是结果可视化、真实人设、前后对比、门店/学员证明；信任来自“看得见的改变”。';
  if (domain.includes('短视频') || domain.includes('电商') || domain.includes('成交文案') || domain.includes('广告') || domain.includes('商业')) return '课程和商业认知类共同点是强观点、人性洞察、学员/圈层证明、私域关键词；信任来自“你说出了老板心里话”。';
  if (domain.includes('装修') || domain.includes('家居')) return '装修家居类共同点是避坑清单、现场过程、流程透明、空间结果；信任来自“我能替你减少损失”。';
  if (domain.includes('宠物')) return '宠物类共同点是风险提醒、误区纠正、产品测评；信任来自“我帮你少犯错”。';
  if (domain.includes('工程律师') || domain.includes('建筑')) return '工程律师类共同点是行业现实、案件难度、团队/证据资产；信任来自“我懂工程老板的处境，也有办法处理复杂案子”。';
  if (domain.includes('工厂') || domain.includes('电气') || domain.includes('定制')) return '工厂类共同点是展厅、设备、库存、投入金额和老板故事；信任来自“供应链资产可见”。';
  if (domain.includes('跨境')) return '跨境AI类共同点是趋势判断和在场证据；信任来自“我已经参与这个机会”。';
  return '共同点是把身份、证据、场景、结果和转化入口绑定。';
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const ids = Object.keys(accountNotes).sort();
  const rows = [];
  for (const id of ids) {
    const raw = await readRaw(id);
    const lines = getLines(raw.page?.text || '');
    const profile = extractProfile(lines);
    const note = accountNotes[id];
    rows.push({
      id,
      accountName: profile.name || raw.page?.title?.replace('的抖音 - 抖音', '') || id,
      sourceLink: raw.sourceLink || '',
      resolvedUrl: raw.page?.url || '',
      screenshot: raw.screenshot || path.join(rawDir, `${id}.png`),
      followers: profile.followers,
      likes: profile.likes,
      works: profile.works,
      douyinId: profile.douyinId,
      ip: profile.ip,
      introVisible: profile.intro,
      sampleTitles: extractTitles(lines),
      ...note,
    });
  }

  const summary = buildMethodSummary(rows);
  const analysis = {
    generatedAt: new Date().toISOString(),
    source: 'outputs/account_full_analysis/raw/*.json + raw screenshots',
    note: '只使用主页可见信息和用户提供的母方法经验；没有逐条视频转写的账号，精确逐字稿/数据标记为需补充。',
    count: rows.length,
    rows,
    methodSummary: summary,
    methodBlocks,
  };
  await fs.writeFile(path.join(outDir, 'account_analysis.json'), `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');

  const md = [
    '# 对标账号全量拆解报告',
    '',
    `生成时间：${analysis.generatedAt}`,
    '',
    '## 结论先行',
    '',
    '- 这些账号共同验证了你的判断：个人IP底层相通，差异只在“信任资产怎么外显”。',
    '- 吾天账号的母方法可以迁移：受众洞察、真实人设、高价值信号、场景化信任、结果前置、异议化解。',
    '- 其他账号新增了行业变体：美业前后对比、课程私域关键词、装修避坑清单、宠物风险测评、工厂供应链资产、跨境趋势在场证明。',
    '- 当前缺口不是主页分析，而是代表爆款逐字稿、评论区高意向词、私域承接话术和成交数据。',
    '',
    '## 行业方法总结',
    '',
    ...summary.flatMap((item) => [
      `### ${item.domain}`,
      '',
      `- 样本数：${item.count}`,
      `- 核心发现：${item.coreFinding}`,
      `- 覆盖账号：${item.accounts.join('、')}`,
      '',
    ]),
    '## 账号逐条拆解',
    '',
    markdownTable(rows),
    '',
    '## 可沉淀的新方法卡',
    '',
    ...methodBlocks.flatMap((block) => [
      `### ${block.title}`,
      '',
      `- 方法：${block.methods.join('、')}`,
      `- 场景：${block.scenarios.join('、')}`,
      `- 必填信息：${block.requiredInputs.join('、')}`,
      `- 输出骨架：${block.outputTemplate.join('、')}`,
      `- 示例：${block.example}`,
      '',
    ]),
    '## 下一步需要补的视频证据',
    '',
    '- 每个重点行业至少补 3 条高赞/高咨询视频链接：美业变美、知识付费、装修、宠物、工程律师、工厂老板。',
    '- 每条视频最好补评论区截图、私信第一句话、是否带来咨询/成交。',
    '- 对吾天账号继续补：低粉爆款从哪里找、如何筛、如何改前几句、如何避免违规和同质化。',
    '',
  ].join('\n');
  await fs.writeFile(path.join(outDir, 'account_analysis.md'), md, 'utf8');

  const structured = JSON.parse((await fs.readFile(structuredPath, 'utf8')).replace(/^\uFEFF/, ''));
  const existing = new Set((structured.blocks || []).map((block) => block.id));
  let added = 0;
  for (const block of methodBlocks) {
    if (!existing.has(block.id)) {
      structured.blocks.push(block);
      added += 1;
    }
  }
  if (added > 0) {
    structured.version = '2026-07-10-benchmark-account-methods-v1';
    structured.description = `${structured.description || ''} Added benchmark account method cards from account homepage analysis.`.trim();
    await fs.writeFile(structuredPath, `${JSON.stringify(structured, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    accounts: rows.length,
    addedMethodBlocks: added,
    files: [
      path.join(outDir, 'account_analysis.json'),
      path.join(outDir, 'account_analysis.md'),
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
