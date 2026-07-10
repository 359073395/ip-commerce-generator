import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const rawDir = path.join(root, 'outputs', 'account_full_analysis', 'raw');
const outDir = path.join(root, 'outputs', 'account_video_deep_analysis');

const accountGroups = {
  H001: '本地美业/同城流量',
  H002: '本地美业/美甲店',
  H003: '变美技术/眉毛',
  H004: '美业账号诊断',
  H005: '美学主理人',
  H006: '高审美生活方式',
  H007: '短视频课程',
  H008: 'AI商业课程',
  H009: '企业流量增长',
  H010: '电商管理咨询',
  H011: '成交文案课程',
  H012: '广告认知',
  H013: '商业认知老板圈',
  H014: '商业咨询头部',
  H031: '装修避坑',
  H032: '装修内幕',
  H033: '装修公司流程',
  H034: '装修日记',
  H035: '宠物医院',
  H036: '宠物测评',
  H044: '工程律师难案',
  H045: '工程律师团队',
  H047: 'AI跨境服务商',
  H067: '变美闺蜜',
  H068: '比例美学专家',
  H069: '电气工厂老板',
  H070: '家居定制工厂',
};

const strongSignals = [
  '第一视角', '业绩', '爆炸', '千元', '抓路人', '前后对比', '变装', '改造',
  '怎么拍', '帮粉丝', '同城', '老板', '为什么', '一定', '不要', '最怕',
  '成交', '文案', '流量', '变现', '赚钱', '商业', '认知', '破产', '致命',
  '避坑', '细节', '装修', '验收', '增项', '流程', '预算', '踩坑',
  '虐猫', '预算', '测评', '总结', '误区', '猫粮', '狗粮',
  '工程', '工程款', '纠纷', '打官司', '回款', '执行', '团队',
  '工厂', '展厅', '七位数', '2亿', '5000', '供应链', '直播',
  'AI', '跨境', '东南亚', 'TikTok', '利润', '趋势',
];

function parseMetric(text = '') {
  const firstLine = text.split(/\n+/).map((line) => line.trim()).find((line) => /置顶|^\d/.test(line)) || '';
  const pinned = firstLine.includes('置顶') || text.includes('置顶');
  const metricMatch = text.match(/(?:置顶\s*)?(\d+(?:\.\d+)?)(万)?/);
  if (!metricMatch) return { pinned, metricText: pinned ? '置顶' : '', metricValue: pinned ? 100000 : 0 };
  const value = Number(metricMatch[1]) * (metricMatch[2] ? 10000 : 1);
  return {
    pinned,
    metricText: `${metricMatch[1]}${metricMatch[2] || ''}`,
    metricValue: value + (pinned ? 100000 : 0),
  };
}

function cleanTitle(text = '') {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== '置顶')
    .filter((line) => !/^\d+(\.\d+)?万?$/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreVideo(video) {
  let score = video.metricValue / 1000;
  if (video.pinned) score += 150;
  const title = video.title;
  for (const signal of strongSignals) {
    if (title.includes(signal)) score += 18;
  }
  if (/#/.test(title)) score += 8;
  if (/第\d+天|一周|十年|11年|18年|30年|500套|400w|1000|七位数|2亿|5000/.test(title)) score += 24;
  if (/老板|客户|顾客|学员|工程人|新手|普通人|卖家/.test(title)) score += 16;
  return Math.round(score);
}

async function readJson(file) {
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const ids = Object.keys(accountGroups).sort();
  const accounts = [];
  for (const id of ids) {
    const raw = await readJson(path.join(rawDir, `${id}.json`));
    const links = raw.page?.links || [];
    const videoLinks = links
      .filter((item) => item.href && item.href.includes('/video/'))
      .filter((item) => !/[?&]source=Baiduspider/.test(item.href))
      .map((item) => {
        const metric = parseMetric(item.text || '');
        const title = cleanTitle(item.text || '');
        return {
          id: item.href.match(/\/video\/(\d+)/)?.[1] || '',
          url: item.href,
          title,
          ...metric,
        };
      })
      .filter((item) => item.id && item.title)
      .map((item) => ({ ...item, score: scoreVideo(item) }));
    const unique = [];
    const seen = new Set();
    for (const item of videoLinks.sort((a, b) => b.score - a.score)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
    }
    accounts.push({
      accountId: id,
      group: accountGroups[id],
      accountName: raw.page?.title?.replace('的抖音 - 抖音', '') || id,
      sourceLink: raw.sourceLink,
      resolvedUrl: raw.page?.url,
      totalVideoLinks: unique.length,
      selected: unique.slice(0, 5),
      candidates: unique.slice(0, 12),
    });
  }

  const selectedVideos = accounts.flatMap((account) => account.selected.map((video, index) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    group: account.group,
    rank: index + 1,
    ...video,
  })));

  await fs.writeFile(
    path.join(outDir, 'video-candidates.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), accounts, selectedVideos }, null, 2)}\n`,
    'utf8',
  );

  const md = [
    '# 对标账号视频候选池',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    `账号数：${accounts.length}`,
    `深拆候选视频：${selectedVideos.length}`,
    '',
    '## 按账号候选',
    '',
    ...accounts.flatMap((account) => [
      `### ${account.accountId} ${account.accountName}｜${account.group}`,
      '',
      ...account.selected.map((video) => `- ${video.pinned ? '置顶 ' : ''}${video.metricText || '-'}｜${video.title}｜${video.url}`),
      '',
    ]),
  ].join('\n');
  await fs.writeFile(path.join(outDir, 'video-candidates.md'), md, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    accounts: accounts.length,
    selectedVideos: selectedVideos.length,
    withoutVideos: accounts.filter((account) => account.selected.length === 0).map((account) => account.accountId),
    files: [
      path.join(outDir, 'video-candidates.json'),
      path.join(outDir, 'video-candidates.md'),
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
