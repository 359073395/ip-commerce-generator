# IP商业方案生成器

这是一个本地和 VPS 都可部署的知识库驱动 Web 应用。前端保留“点开继续选择”的模块体验，后台把用户填写的表格、层级选项、IP定位上下文和项目内 `knowledge/` 资料组装成提示词，再发送给兼容 OpenAI API 的大模型。

## 第一版功能

- 不需要注册登录。
- API 可以在网页里配置，保存后写入服务端 `.env`；安装时不需要填写 API。
- 知识库资料已经项目化，部署到 VPS 时读取 `knowledge/` 目录。
- 模块顺序：`IP定位`、`爆款选题`、`成交选题`、`痛点选题`、`脚本创作`、`文案二创`、`爆款拆解`、`文案洗稿`、`带货`。
- 每个模块默认输出完整骨架，不输出最小版本。
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
PORT=8790
HOST=0.0.0.0
OPENAI_TIMEOUT_MS=45000
OPENAI_MAX_TOKENS=1200
OPENAI_TEMPERATURE=0.4
OPENAI_REASONING_EFFORT=low
KNOWLEDGE_BUDGET_CHARS=1200
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
- 生成 `.env`，如果已经存在则默认保留；需要重写时使用 `FORCE_ENV=1`。
- 写入质量优先的模型配置：`gpt-5.5` 主模型，`gpt-5.4,gemini-3-flash,gpt-5.4-mini` 备用模型，主模型超时 `45000ms`。
- 校验 `knowledge/manifest.json` 中的知识库文件。
- 创建并启动 systemd 服务 `ip-commerce-generator`。
- 默认安装 Nginx Basic Auth。第一版不做登录时建议保留，开启后 Node 服务只监听 `127.0.0.1`，外部访问走 Nginx 鉴权。脚本会自动生成访问密码。

默认开启 Basic Auth 时访问：

```text
http://服务器IP/
```

如果关闭 Basic Auth，则访问：

```text
http://服务器IP:8790/
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
curl http://127.0.0.1:8790/api/health
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

默认安装完成后会输出 Nginx Basic Auth 的账号和自动生成的密码。登录网站后，在右上角“配置API”里填写兼容 OpenAI API 的 Base URL、API Key，并选择模型。

## 知识库稳定性

服务端只读取项目内 `knowledge/`，不会依赖 Windows 本地路径。部署时要确保这些文件一起上传：

- `knowledge/handbooks/personal-ip.md`
- `knowledge/handbooks/commerce-video.md`
- `knowledge/handbooks/combined.md`
- `knowledge/templates/*.json`
- `knowledge/manifest.json`

如果更新知识库文件，需要同步更新 `knowledge/manifest.json`，否则 `/api/knowledge/verify` 会提示哈希不一致。
