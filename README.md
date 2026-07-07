# IP商业内容 Agent 系统

这是一个知识库驱动的 Web 应用，用来把前端表单、层级选项、IP定位上下文、项目档案记忆和 `knowledge/` 资料一起组装成提示词，再交给兼容 OpenAI API 的大模型生成完整内容骨架。

## 核心功能

- SQLite 多用户登录：不再默认使用统一网页密码。
- 管理员创建用户、禁用用户、重置密码、设置每日生成次数。
- 每个用户拥有独立项目列表，每个项目都有自己的长期档案记忆。
- 项目档案会保存行业、人设、产品/服务、目标用户、信任证据、承接方式、IP定位结果等信息，后续所有模块自动继承。
- 管理员在网页里配置模型 API：Base URL、API Key、自动检测模型、选择模型。
- 前端保留“点开继续选择”的原站体验，模块包括 IP定位、爆款选题、成交选题、痛点选题、脚本创作、文案二创、爆款拆解、文案洗稿、带货。
- 后端结合 Agent 配置、4P原则、八大爆款元素、知识库模板和质量自检生成完整骨架，不输出最小骨架。
- VPS 默认端口模式：Node 服务监听 `0.0.0.0:8790`，方便宝塔、1Panel、Nginx、Caddy、x-ui 等工具反代。

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

开发环境里，Vite 默认把 `/api` 代理到 `http://127.0.0.1:8790`。如果后端端口不同：

```bash
VITE_API_TARGET=http://127.0.0.1:8796 npm run dev
```

首次启动时会创建管理员账号：

```env
ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=change-this-admin-password
```

登录后由管理员在右上角“配置API”里填写模型接口；普通用户不会看到 API 设置入口。

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

`APP_AUTH_ENABLED=false` 是默认值，表示统一网页密码关闭。保留这些变量只是为了兼容老部署或外层 Basic Auth 需求。

## 数据存储

多用户、登录会话、项目档案、生成记录保存在：

```text
data/app.db
```

旧版单项目档案 `data/project-profile.json` 如果存在，会在首次初始化数据库时导入到管理员默认项目。以后主要使用 `data/app.db`。

不要把 `data/app.db`、`.env`、API Key 或真实用户数据提交到 GitHub。

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

## 知识库稳定性

服务端只读取项目内 `knowledge/`，不依赖 Windows 本地路径。部署时要确保这些文件一起上传：

- `knowledge/handbooks/personal-ip.md`
- `knowledge/handbooks/commerce-video.md`
- `knowledge/handbooks/combined.md`
- `knowledge/templates/*.json`
- `knowledge/manifest.json`

校验知识库：

```bash
npm run verify:knowledge
```

如果更新知识库文件，需要同步更新 `knowledge/manifest.json`，否则 `/api/knowledge/verify` 会提示哈希不一致。

## 测试

```bash
npm run build
npm run verify:knowledge
npm run test:agent-contract
npm run test:project-profile
npm run test:auth-projects
```
