# IP商业内容 Agent 系统

一个由真实个人IP运营与商业变现经验驱动的内容 Agent 系统。

这不是普通的 AI 文案生成器，也不是一组简单提示词。它的核心价值在于背后的专业知识库：把长期个人IP运营、账号增长、短视频内容成交、带货视频和商业变现经验，沉淀成可被系统调用的结构化方法库，再交给 Agent 执行链完成定位、选题、脚本、成交和复盘。

系统会把前端选择项、用户项目档案、行业信息、结构化知识块和完整知识库一起组织成提示词，发送给兼容 OpenAI API 的大模型，生成可执行的完整内容骨架。

## 核心定位

**IP商业内容 Agent 系统 = 实战知识库 + 项目档案 + 模块化选择 + 大模型生成 + 质量评估**

它解决的问题不是“帮我随便写一条短视频文案”，而是：

- 账号到底应该怎么定位
- 这个人设应该卖什么、卖给谁、怎么建立信任
- 每个阶段应该做什么选题
- 爆款选题应该调用哪种爆款元素
- 四类脚本应该怎么选择和展开
- 痛点选题、成交选题、带货视频如何服务商业转化
- 生成结果是否结合了项目事实、前端选择和知识库方法
- 多用户、多项目情况下如何长期沉淀账号档案

## 为什么它有壁垒

很多 AI 工具的核心是模型，换一个模型效果就差不多。

这个项目的核心是知识库。

知识库不是从公开资料简单拼接出来的，而是围绕真实个人IP运营和变现经验沉淀的内容方法体系，覆盖：

- 个人IP定位
- 人设关系设计
- 信任资产建设
- 内容矩阵规划
- 八大爆款元素
- 四类脚本卡
- 痛点选题
- 成交选题
- 带货4P拆解
- 商品卡/小黄车/TikTok Shop承接
- 本地到店、私域、课程、咨询等转化路径
- 脏数据处理和质量评估

当前结构化知识库包含：

- `65` 个结构化方法块
- `102` 个离线质量基准案例
- 个人IP、带货视频、组合型商业内容三类知识路径
- 覆盖 9 个核心生成模块的 Agent 合约

## 系统能力

### 1. 个人IP商业定位

系统会结合用户填写的行业、身份、人设、产品/服务、目标用户、信任资产和承接方式，生成完整的IP定位方案。

输出不只是“定位一句话”，还包括：

- 信息判断
- IP定位一句话
- 目标用户画像
- 人设资产
- 商业路径
- 内容矩阵
- 转化入口
- 待确认项

### 2. 爆款选题与八大元素

支持围绕爆款元素生成选题：

- 成本
- 人群
- 猎奇
- 头牌
- 怀旧
- 反差
- 最差
- 吸引力

这些不是前端表面选项，而是会进入后端知识检索和提示词组织，用于影响真实生成结果。

### 3. 四类脚本创作

脚本不是一个大文本框直接生成，而是按个人IP内容矩阵拆成四类：

- 教知识
- 晒过程
- 讲故事
- 聊观点

并继续细分到推荐型、解题型、案例型、揭秘型、测评、观点立场、争议互动、任务挑战等脚本策略。

### 4. 成交选题与痛点选题

系统支持把内容从“有流量”推进到“能成交”：

- 成交理由
- 信任证明
- 异议化解
- 信任阶梯
- 评论关键词
- 私信/表单
- 到店预约
- 私域/课程
- 商品卡/小黄车
- 直播预热

### 5. 带货视频模块

带货视频不是简单写卖点，而是结合4P和成交链路：

- Product：产品/服务是什么
- Price：价格和性价比如何表达
- Place：使用场景和购买场景
- Promotion：促销、福利、直播、商品卡

适用于 TikTok Shop、小黄车、商品卡、本地团购券、线上课程、自有产品和服务型产品。

### 6. 多用户和多项目档案

第一版已经不是单用户工具，而是支持 SQLite 多用户登录：

- 管理员创建用户
- 用户独立登录
- 每个用户拥有多个项目档案
- 每个项目保存长期账号信息
- 后续生成自动继承项目档案
- 生成历史按用户和项目隔离

这让系统可以服务多个IP、多个客户、多个账号，而不是每次都从零开始填资料。

### 7. Agent 执行链

用户可以输入一句目标，系统先做任务判断：

- 判断是个人IP、带货视频，还是组合型任务
- 推荐应该进入哪个模块
- 识别信息缺口
- 遇到空输入、模糊输入、提示词注入类文本时不会直接胡编
- 执行后保存任务结果和质量状态

这让它更接近一个“IP商业内容 Agent”，而不是普通表单生成器。

### 8. 质量评估和离线基准

项目内置质量评估和离线基准测试：

- 检查生成结果是否使用了用户事实
- 检查是否结合前端选择
- 检查是否命中知识库方法
- 检查是否有完整骨架
- 检查是否包含风险提醒和待确认项
- 用 102 个案例覆盖个人IP、选题、脚本、成交、带货、改写、拆解、润色等场景

## 技术栈

- React + Vite
- Node.js + Express
- SQLite(sql.js)
- 兼容 OpenAI API 格式的大模型接口
- 服务端知识库检索与提示词组装
- 多用户登录、项目档案、生成历史、Agent任务记录

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

开发环境里，Vite 默认把 `/api` 代理到：

```text
http://127.0.0.1:8790
```

如果后端端口不同：

```bash
VITE_API_TARGET=http://127.0.0.1:8796 npm run dev
```

首次启动会创建管理员账号：

```env
ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=change-this-admin-password
```

登录后由管理员在网页右上角“配置API”里填写模型接口。普通用户不会看到 API 设置入口。

## 环境变量

```env
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_API_KEY=replace-with-your-key
OPENAI_MODEL=gpt-5.5
OPENAI_FALLBACK_MODELS=gpt-5.4,gemini-3-flash,gpt-5.4-mini

APP_AUTH_ENABLED=false
# Optional legacy shared page password. Keep disabled for normal multi-user login.
# APP_AUTH_USER=admin
# APP_AUTH_PASSWORD=change-this-password

ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=change-this-admin-password

PORT=8790
HOST=0.0.0.0
OPENAI_TIMEOUT_MS=45000
OPENAI_FALLBACK_TIMEOUT_MS=30000
OPENAI_MAX_TOKENS=1200
OPENAI_TEMPERATURE=0.4
OPENAI_REASONING_EFFORT=low
KNOWLEDGE_BUDGET_CHARS=1200
AGENT_REVIEW_ENABLED=true
AGENT_REVIEW_MAX_TOKENS=1200
AGENT_REVIEW_TIMEOUT_MS=20000
```

`APP_AUTH_ENABLED=false` 是默认值，表示旧版统一网页密码关闭。现在推荐使用 SQLite 多用户登录。

## 数据存储

多用户、登录会话、项目档案、Agent任务、生成记录保存在：

```text
data/app.db
```

不要把下面这些内容提交到 GitHub：

- `data/app.db`
- `.env`
- API Key
- 真实用户数据
- 真实客户项目数据

## VPS 一键安装

公开仓库安装：

```bash
curl -fsSL https://raw.githubusercontent.com/359073395/ip-commerce-generator/main/scripts/install-from-github.sh | sudo bash
```

指定仓库、分支、目录：

```bash
curl -fsSL https://raw.githubusercontent.com/359073395/ip-commerce-generator/main/scripts/install-from-github.sh | sudo env GITHUB_REPO=359073395/ip-commerce-generator GITHUB_REF=main APP_DIR=/opt/ip-commerce-generator bash
```

安装完成后脚本会输出：

- 访问地址，例如 `http://服务器IP:8790/`
- 初始管理员用户名
- 初始管理员密码
- 健康检查命令

第一次进入网页后，用管理员账号登录，再在网页里配置 API。API 不需要在安装命令里填写。

如果网页打不开，先在 VPS 上诊断：

```bash
sudo bash /opt/ip-commerce-generator/scripts/diagnose-vps.sh
```

端口模式需要云服务器安全组或防火墙放行 TCP 8790：

```bash
sudo ufw allow 8790/tcp
sudo systemctl restart ip-commerce-generator
```

## 升级部署

在 VPS 上重新运行一键安装脚本即可。脚本会保留 `.env` 和 `data/`，不会覆盖已有用户、项目档案和 API 配置。

```bash
curl -fsSL https://raw.githubusercontent.com/359073395/ip-commerce-generator/main/scripts/install-from-github.sh | sudo bash
```

注意：`INITIAL_ADMIN_PASSWORD` 只在数据库第一次创建管理员时生效。已有 `data/app.db` 后，修改 `.env` 里的这个值不会重置管理员密码，需要在后台“用户管理”里重置。

## 常用运维命令

```bash
sudo systemctl status ip-commerce-generator --no-pager
sudo journalctl -u ip-commerce-generator -f
sudo systemctl restart ip-commerce-generator
curl http://127.0.0.1:8790/api/health
```

## 知识库文件

服务端只读取项目内 `knowledge/`，部署后不依赖本地 Windows 路径。部署时需要确保这些文件一起上传：

- `knowledge/handbooks/personal-ip.md`
- `knowledge/handbooks/commerce-video.md`
- `knowledge/handbooks/combined.md`
- `knowledge/structured-blocks.json`
- `knowledge/quality-benchmark-cases.json`
- `knowledge/templates/*.json`
- `knowledge/manifest.json`

校验知识库：

```bash
npm run verify:knowledge
```

如果更新 `knowledge/handbooks/` 或 `knowledge/templates/` 中受 manifest 管理的文件，需要同步更新 `knowledge/manifest.json`，否则 `/api/knowledge/verify` 会提示哈希不一致。

## 测试

推荐在修改知识库、Agent链路、用户系统或部署脚本后运行：

```bash
npm run build
npm run verify:knowledge
npm run test:knowledge-retrieval
npm run test:quality-benchmark
npm run test:quality-evaluation
npm run test:productized-generation
npm run test:agent-contract
npm run test:agent-planner-dirty
npm run test:agent-execution
npm run test:project-profile
npm run test:auth-projects
npm run test:generation-history
npm run test:admin-overview
```

## 后续学习方向

系统可以继续吸收新的实战资料：

- 对标账号
- 爆款视频链接
- 公开视频文案
- 账号时间线
- 行业案例
- 成交脚本
- 带货视频样本

新样本不会被简单复制，而是会被拆成：

- 选题结构
- 开头钩子
- 脚本类型
- 爆款元素
- 信任证明
- 成交路径
- 风险边界
- 可复用方法卡

这也是系统长期变强的核心方式。
