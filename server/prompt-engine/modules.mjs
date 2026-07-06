export const moduleDefinitions = [
  {
    id: 'ip-positioning',
    label: 'IP定位',
    taskType: 'personal_ip',
    knowledge: ['个人IP核心公式', '商业定位', '目标用户', '人设资产', '内容矩阵', '默认交付包'],
    output: ['信息判断', 'IP定位一句话', '商业路径', '目标用户画像', '人设资产', '内容矩阵方向', '待确认项'],
  },
  {
    id: 'viral-topics',
    label: '爆款选题',
    taskType: 'personal_ip',
    knowledge: ['个人IP选题系统', '8类爆款元素', '人群 × 场景 × 痛点/情绪 × 爆款元素公式'],
    output: ['爆款元素分类', '选题标题', '适用人群', '第一秒钩子', '拍摄角度', '推荐脚本类型'],
  },
  {
    id: 'conversion-topics',
    label: '成交选题',
    taskType: 'combined',
    knowledge: ['商业定位', '目标用户', '信任资产', '咨询/私域/直播承接'],
    output: ['成交型选题', '成交理由', '信任证明', 'CTA', '承接路径', '发布阶段'],
  },
  {
    id: 'pain-topics',
    label: '痛点选题',
    taskType: 'combined',
    knowledge: ['目标用户画像', '需求场景', '购买冲突', '痛点和潜在需求'],
    output: ['痛点清单', '场景化选题', '情绪钩子', '用户原话模拟', '脚本方向'],
  },
  {
    id: 'script',
    label: '脚本创作',
    taskType: 'combined',
    knowledge: ['个人IP四类脚本卡', '带货成交链路', '内容类型脚本结构', '拍摄剪辑原则'],
    output: ['标题', '封面文案', '黄金3秒', '完整口播', '分镜/B-roll', '字幕重点', 'CTA'],
  },
  {
    id: 'rewrite',
    label: '文案二创',
    taskType: 'combined',
    knowledge: ['选题系统', '脚本结构', '差异化表达', '平台表达方式'],
    output: ['二创版本', '结构变化说明', '标题/封面文案', '口播优化建议', '风险提醒'],
  },
  {
    id: 'viral-analysis',
    label: '爆款拆解',
    taskType: 'combined',
    knowledge: ['爆款结构', '黄金3秒', '情绪刺点', '成交链路', '商品视觉化'],
    output: ['拆解报告', '爆款元素', '可复用结构', '本账号改写方向', '下一条选题建议'],
  },
  {
    id: 'polish',
    label: '文案洗稿',
    taskType: 'combined',
    knowledge: ['脚本结构', '表达重组', '痛点重写', '不同风格话术'],
    output: ['新文案版本', '改写逻辑', '与原文差异', '可拍摄建议', '合规提醒'],
  },
  {
    id: 'commerce',
    label: '带货',
    taskType: 'commerce_video',
    knowledge: ['需求拆解', '成交理由', '信任证明', '商品视觉化', 'TikTok补充', '复盘表'],
    output: ['产品需求拆解', '购买情境', '成交理由', '信任证明', '带货脚本', '商品视觉化拍摄清单', '承接话术', 'CTR/CVR/GMV复盘动作'],
  },
];

export function getModuleDefinition(moduleId) {
  return moduleDefinitions.find((item) => item.id === moduleId) || moduleDefinitions[0];
}
