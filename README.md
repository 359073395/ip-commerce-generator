# IP商业方案生成器

这是一个本地和 VPS 都可部署的知识库驱动 Web 应用。前端保留“点开继续选择”的模块体验，后台把用户填写的表格、层级选项、IP定位上下文和项目内 `knowledge/` 资料组装成提示词，再发送给兼容 OpenAI API 的大模型。

## 第一版功能

- 不需要注册登录。
- VPS 部署默认开启网页访问密码；先输入账号密码，才能进入网页和调用 API。
- API 可以在网页里配置，保存后写入服务端 `.env`；安装时不需要填写 API。
- 知识库资料已经项目化，部署到 VPS 时读取 `knowledge/` 目录。
- 模块顺序：`IP定位`、`爆款选题`、`成交选题`、`痛点选题`、`脚本创作`、`文案二创`、`爆款拆解`、`文案洗稿`、`带货`。
- 每个模块默认输出完整骨架，不输出最小版本。
- 每个模块内置 Agent 配置：角色、目标、工具、规则和输出格式。
- 默认开启 Agent 自检：先生成初稿，再按知识库规则评审修正一遍。
- 后续模块会继承 `IP定位` 生成结果作为上下文。

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:5173
```

`.env` 示例：

```bash
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_API_KEY=replace-with-your-key
OPENAI_MODEL=gpt-5.5
OPENAI_FALLBACK_MODELS=gpt-5.4,gemini-3-flash,gpt-5.4-mini
APP_AUTH_ENABLED=false
APP_AUTH_USER=admin
APP_AUTH_PASSWORD=change-this-password
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

## 生产运行

```bash
npm install
npm run build
NODE_ENV=production node server/index.mjs
```

生产服务默认监听：

```text
http://服务器IP:8790
```

## VPS一键部署

把项目上传到 VPS 后，在项目根目录执行：

```bash
sudo bash scripts/deploy-vps.sh
```

安装时默认不配置 API。部署完成后打开网页，点右上角“配置API”，填写 Base URL、API Key，并自动检测模型。

也可以通过环境变量预置配置：

```bash
OPENAI_BASE_URL=https://api.example.com/v1 \
OPENAI_API_KEY=sk-xxxx \
OPENAI_MODEL=gpt-5.5 \
OPENAI_FALLBACK_MODELS=gpt-5.4,gemini-3-flash,gpt-5.4-mini \
OPENAI_TIMEOUT_MS=45000 \
PORT=8790 \
sudo -E bash scripts/deploy-vps.sh
```

脚本会完成：

- 检查或安装 Node.js 20。
- 安装依赖并构建前端。
- 生成 `.env`；如果已经存在，会保留 API 配置并更新部署默认项；需要完全重写时使用 `FORCE_ENV=1`。
- 默认开启应用自带网页密码，密码保存在 `.env`，不依赖 Nginx。
- 写入质量优先的模型配置：`gpt-5.5` 主模型，`gpt-5.4,gemini-3-flash,gpt-5.4-mini` 备用模型，主模型超时 `45000ms`。
- 写入 Agent 自检配置：`AGENT_REVIEW_ENABLED=true`，生成质量优先；自检默认最多等待 `20000ms`，如果想提升速度可改为 `false` 后重启服务。
- 校验 `knowledge/manifest.json` 中的知识库文件。
- 创建并启动 systemd 服务 `ip-commerce-generator`。
- 默认使用端口模式：Node 服务监听 `0.0.0.0:8790`，方便用宝塔、1Panel、Nginx、Caddy、x-ui 等工具反代。
- 如果需要脚本自动安装 Nginx Basic Auth，可以设置 `ENABLE_NGINX_BASIC_AUTH=yes`。开启后 Node 服务只监听 `127.0.0.1`，外部访问走 Nginx 鉴权。

默认端口模式访问：

```text
http://服务器IP:8790/
```

首次打开会弹出浏览器账号密码框。默认账号是 `admin`，安装脚本会自动生成密码并在安装完成时输出。

查看当前网页密码：

```bash
sudo grep -E '^(APP_AUTH_USER|APP_AUTH_PASSWORD)=' /opt/ip-commerce-generator/.env
```

修改网页密码：

```bash
sudo sed -i 's/^APP_AUTH_USER=.*/APP_AUTH_USER="admin"/' /opt/ip-commerce-generator/.env
sudo sed -i 's/^APP_AUTH_PASSWORD=.*/APP_AUTH_PASSWORD="your-new-password"/' /opt/ip-commerce-generator/.env
sudo systemctl restart ip-commerce-generator
```

如果你已经用宝塔、1Panel、Nginx、Caddy 或 x-ui 在外层做了访问控制，也可以关闭应用自带密码：

```bash
sudo sed -i 's/^APP_AUTH_ENABLED=.*/APP_AUTH_ENABLED="false"/' /opt/ip-commerce-generator/.env
sudo systemctl restart ip-commerce-generator
```

如果开启 Basic Auth，则访问：

```text
http://服务器IP/
```

如果项目已经托管到 Git，也可以让脚本自动拉取：

```bash
APP_DIR=/opt/ip-commerce-generator \
APP_GIT_URL=https://your-git-repo.git \
sudo -E bash scripts/deploy-vps.sh
```

常用运维命令：

```bash
sudo systemctl status ip-commerce-generator
sudo journalctl -u ip-commerce-generator -f
sudo systemctl restart ip-commerce-generator
curl -u "admin:你的网页密码" http://127.0.0.1:8790/api/health
```

## GitHub一键安装

项目公开后，可以在任意 Ubuntu/Debian VPS 上用一条命令安装：

```bash
curl -fsSL https://raw.githubusercontent.com/359073395/ip-commerce-generator/main/scripts/install-from-github.sh | sudo bash
```

也可以指定仓库、分支和安装目录：

```bash
curl -fsSL https://raw.githubusercontent.com/359073395/ip-commerce-generator/main/scripts/install-from-github.sh | sudo env GITHUB_REPO=359073395/ip-commerce-generator GITHUB_REF=main APP_DIR=/opt/ip-commerce-generator bash
```

这个脚本会从 GitHub 下载项目 tarball；如果 VPS 上已有 `.env`，会自动保留原 API 配置。

默认安装完成后会输出访问地址 `http://服务器IP:8790/`。进入网站后，在右上角“配置API”里填写兼容 OpenAI API 的 Base URL、API Key，并选择模型。

安装完成后还会输出网页访问账号和密码。这个密码保护整个网页和后端 API，不会影响你在网页里配置大模型 API。

如果安装后网页打不开，先确认访问的是：

```text
http://服务器IP:8790/
```

默认端口模式需要访问 `:8790`。如果仍然打不开，通常是云服务器安全组或防火墙没有放行 TCP 8790。可以在 VPS 上运行诊断：

```bash
sudo bash /opt/ip-commerce-generator/scripts/diagnose-vps.sh
```

常见修复：

```bash
sudo ufw allow 8790/tcp
sudo systemctl restart ip-commerce-generator
```

## 知识库稳定性

服务端只读取项目内 `knowledge/`，不会依赖 Windows 本地路径。部署时要确保这些文件一起上传：

- `knowledge/handbooks/personal-ip.md`
- `knowledge/handbooks/commerce-video.md`
- `knowledge/handbooks/combined.md`
- `knowledge/templates/*.json`
- `knowledge/manifest.json`

如果更新知识库文件，需要同步更新 `knowledge/manifest.json`，否则 `/api/knowledge/verify` 会提示哈希不一致。
