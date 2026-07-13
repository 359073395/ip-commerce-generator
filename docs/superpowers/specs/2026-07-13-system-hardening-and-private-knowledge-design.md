# IP商业内容 Agent 八项系统加固设计

## 目标

在保留现有用户体验、SQLite 数据、10 个业务模块和 OpenAI 兼容接口的前提下，解决当前八类问题：

1. 长耗时生成和 Agent 链路容易超时。
2. 备用模型只在超时时切换，且无法追踪真实使用模型。
3. 内容实验只记录，不会反哺后续生成。
4. `sql.js` 全量写文件存在并发覆盖和损坏风险。
5. 知识库完整性校验不覆盖核心结构化方法库。
6. 离线质量测试不能代表真实模型质量。
7. 公开仓库暴露核心知识库、完整转写和 OCR 资料。
8. 前端、部署和安全细节仍影响真实使用。

本次采用“模块化演进”，不推倒重写，也不继续向 `src/App.jsx`、`server/database.mjs` 和部署脚本堆叠跨领域逻辑。

## 非目标

- 不引入 Kubernetes、Redis、外部向量数据库或微服务集群。
- 不改变用户熟悉的模块名称和原版风格入口。
- 不在本阶段增加支付、套餐计费、开放注册和第三方登录。
- 不自动重写 GitHub 公共仓库历史；历史清理属于部署验证后的单独高风险操作。
- 不把第三方参考内容的完整表达继续打包进公开程序仓库。

## 总体架构

系统拆成五条稳定边界：

```text
React UI
  -> API Client
  -> Persistent Job Service
  -> Generation Orchestrator
       -> Model Router
       -> Prompt + Knowledge Retrieval
       -> Quality Evaluation / Repair
       -> Project Learning Memory
  -> Serialized Database Store
```

建议新增目录：

```text
server/
  jobs/
    jobService.mjs
    jobWorker.mjs
  model-routing/
    modelRouter.mjs
    modelErrors.mjs
  storage/
    databaseStore.mjs
    backupService.mjs
  learning/
    projectLearningService.mjs
  knowledge/
    knowledgeValidator.mjs
  validation/
    requestSchemas.mjs

src/
  api/
    client.js
    generationJobs.js
  features/
    generation/
    experiments/
    projects/
    admin/
  components/
    layout/
    forms/
    results/
```

现有文件只保留编排责任：

- `server/index.mjs`：路由注册、鉴权和统一错误响应。
- `server/database.mjs`：兼容导出层，逐步把实现委托给 storage/repository。
- `server/generationService.mjs`：单次生成业务编排，不直接处理重试、文件写入或 HTTP。
- `src/App.jsx`：页面级状态和路由式视图切换，不再包含所有弹窗、API 和业务卡片实现。

## 兼容与迁移原则

- 数据库迁移只增加表和字段，不删除现有用户、项目、生成记录、实验或 Agent 记录。
- 所有新 JSON 字段读取时提供空值兼容，旧记录仍可正常展示。
- jobs API 上线后保留旧同步 API 一个版本周期，便于 VPS 分阶段升级和回滚。
- 本地开发允许显式使用 `KNOWLEDGE_DIR`；自动化测试固定使用脱敏的 `knowledge-sample/`，不依赖开发者私人目录。
- 生产环境第一次升级时，如果 `/opt/ip-commerce-knowledge` 不存在但旧 `${APP_DIR}/knowledge` 存在，安装器先复制到外部目录、完成 manifest 校验，再切换 `KNOWLEDGE_DIR`。校验失败时继续使用旧版本，不删除原目录。
- 数据库和知识目录迁移完成前不替换 systemd 服务版本，确保失败可以回到原程序。

## 1. 后台任务与完整 Agent 执行链

### 设计

生成和 Agent 执行改为持久化后台任务。前端提交后立即获得 `jobId`，通过短轮询读取进度，不再让反向代理长期保持单个 HTTP 请求。

新增表 `generation_jobs`：

- `id`, `user_id`, `project_id`, `kind`
- `status`: `queued | running | completed | failed | needs_review | cancelled | interrupted`
- `progress_json`, `request_json`, `result_json`, `error_json`
- `cancel_requested`, `created_at`, `started_at`, `completed_at`, `updated_at`

新增 API：

- `POST /api/jobs/generate`
- `POST /api/jobs/agent-run`
- `GET /api/jobs/:jobId`
- `POST /api/jobs/:jobId/cancel`

兼容策略：

- 保留 `/api/generate` 和 `/api/agent/run` 一个版本周期，内部调用同一 orchestrator。
- 新前端只使用 jobs API。
- Agent UI 固定执行完整 4 步上限，不再把 personal/combined 默认链截断为 3 步。
- 每完成一步立即持久化进度和结果，服务重启后将未完成任务标记为 `interrupted`，允许用户重试。

后续步骤上下文不再只传一句 summary，而是传递有长度限制的结构化摘要：定位、目标用户、核心选题、证明材料、CTA、已选脚本类型和质量结论。

### 验收

- 浏览器请求在 2 秒内拿到 jobId。
- 4 步 Agent 链可见逐步进度，最终包含脚本结果。
- 反代 60 秒限制不再导致前端 `Load failed`。
- 服务重启不会产生永久 `running` 任务。

## 2. 模型路由、容错和真实元数据

### 设计

新增 `modelRouter`，统一处理模型调用、兼容参数、错误分类和备用模型。

允许切换备用模型的情况：

- 超时和网络连接错误。
- HTTP `408`, `429`, `500`, `502`, `503`, `504`。
- 明确的模型不可用、模型不存在或临时容量不足错误。

禁止自动切换的情况：

- API Key 无效或权限不足：`401`, `403`。
- 用户请求不合法且与模型兼容参数无关。
- 内容安全拒绝。

每次调用返回：

```json
{
  "result": {},
  "meta": {
    "requestedModel": "gpt-5.6-sol",
    "usedModel": "gpt-5.4",
    "latencyMs": 42100,
    "attempts": [],
    "usage": {}
  }
}
```

生成记录新增 `model_meta_json` 和 `elapsed_ms`。历史记录和管理员状态展示实际模型、是否备用、耗时和失败原因，不再把备用模型结果记成主模型。

后台配置页增加：

- 主模型。
- 可排序的备用模型列表。
- “测试连接”按钮，实际发起一个极小生成请求，而不仅是读取 `/models`。

### 验收

- 429 和 5xx 能进入下一个备用模型。
- 401 不会无意义轮询所有模型。
- 历史记录显示真实模型和完整尝试链。
- 相关逻辑由独立 provider 测试覆盖。

## 3. 内容实验变成项目学习记忆

### 设计

新增表 `project_learning_rules`：

- `id`, `user_id`, `project_id`, `module_id`, `content_type`
- `direction`: `positive | negative`
- `rule_json`, `confidence`, `source_experiment_id`
- `status`: `active | disabled`
- `created_at`, `updated_at`

当 T+3 复盘不是“样本不足”时，系统从原生成记录和真实数据提取：

- 有效或无效的开头机制。
- 目标人群精准度。
- 证明材料和信任方式。
- CTA 与私信、电话、线索、成交结果。
- 应继续追投或应避免的内容变量。

生成前，`generationService` 加载当前项目、当前模块最相关的 3-8 条学习规则，通过单独的 `projectLearningMemory` 区块注入提示词。学习规则的优先级低于用户明确事实，高于通用知识库建议。

防止错误学习：

- 播放样本不足时不生成 active 规则。
- 每条规则保留来源、样本量、指标和置信度。
- 用户可在项目档案中停用错误规则。
- 负向规则只约束对应内容类型，不全局否定某种方法。

前端实验列表默认按 `projectId + moduleId` 过滤，另提供项目全部实验视图。只有包含可发布脚本或正文的结果才允许创建发布实验。

### 验收

- 一条“干净数据”复盘会生成 positive 规则。
- 下一次同项目生成结果能看到学习规则引用。
- “疑似脏数据”只形成局部 negative 规则。
- IP 定位等非发布结果不会出现无意义的发布实验按钮。

## 4. 数据库串行写入、配额和备份

### 设计

保留 `sql.js`，本阶段不引入原生 SQLite 编译依赖。新增 `databaseStore` 作为唯一文件持久化入口：

- 所有写入进入单进程串行队列。
- 每次排队前生成数据库快照，按顺序写入。
- 写入临时文件，`fsync` 后原子替换 `app.db`。
- 保留最近 7 个自动备份。
- 启动时验证数据库可读，主文件损坏时给出明确恢复指令，不静默创建空库。

配额改为任务受理时预占：

- 成功、失败和超时都计入调用次数，防止无限消耗 API。
- 同一普通用户默认只允许 1 个运行任务和 3 个排队任务。
- 管理员可配置每日任务数和并发数。
- 日切时区由 `APP_TIMEZONE` 配置，默认 `Asia/Jakarta`。

新增：

- `scripts/backup-data.sh`
- `scripts/restore-data.sh`
- 可选 systemd timer 每日备份。

### 验收

- 并发写入测试不会出现旧快照覆盖新快照。
- 强制中断写入后原数据库仍可打开。
- 失败模型调用会占用已受理配额。
- 数据库备份和恢复测试通过。

## 5. 知识库完整性与健康状态

### 设计

manifest 必须覆盖所有运行时知识文件：

- 三份 handbooks。
- `structured-blocks.json`。
- `quality-benchmark-cases.json`。
- `templates/*.json`。

新增 `tools/update-knowledge-manifest.mjs` 自动生成版本、文件哈希、结构化块数量、模块覆盖和基准案例数量。

`knowledgeValidator` 同时检查：

- 文件存在和 SHA256。
- JSON 可以解析。
- 结构化块必填字段和唯一 ID。
- 10 个模块都有最低知识覆盖。
- 基准案例引用有效模块。

健康接口行为：

- 核心知识正常：HTTP 200，`ok: true`。
- 核心知识缺失或损坏：HTTP 503，`ok: false`。
- API 未配置但知识正常：系统可登录和配置 API，健康信息明确标记 `api.configured: false`。

### 验收

- 删除或篡改 `structured-blocks.json` 时部署校验失败。
- 管理后台显示准确的 manifest 版本、147 个方法块、104 个案例和 10 个模块覆盖。
- manifest 不再停留在 `2026-07-06-initial`。

## 6. 测试分层与真实模型质量

### 设计

测试明确分成四层：

1. 单元测试：模型错误分类、写队列、学习规则、请求校验。
2. 检索和评分测试：现有 104 个案例，名称改为“离线检索与评分基准”，不再宣称模型质量。
3. HTTP 集成测试：启动临时数据库和本地假 OpenAI 服务，覆盖登录、项目、异步任务、429 fallback、真实模型元数据、实验学习和用户隔离。
4. 可选真实模型测试：显式设置 `RUN_REAL_MODEL_BENCHMARK=true`，默认只跑 1-3 条代表案例，输出质量、耗时、实际模型和失败原因。

重写过时的 `run-api-full-test.mjs`：

- 使用 SQLite 登录 cookie。
- 自动创建隔离测试项目。
- 使用 jobs API 并等待完成。
- 不再硬编码 gpt-5.5 或固定 Base URL。
- 报告写入 `outputs/`，不提交 Git。

质量评估调整：

- 内容长度不再等同于知识证据。
- 知识证据必须命中具体方法、来源或结构要求。
- 用户事实检查区分精确事实和泛化短词。
- 对脚本增加钩子、正文逻辑、证明、CTA 和可拍性检查。

### 验收

- 离线基准报告不再显示为真实模型质量。
- 假模型 HTTP 全链测试不依赖外部 API。
- 真实模型测试需要显式授权，且不会把 API Key 写入报告。

## 7. 私有知识包与原创保护

### 设计

采用“公开程序仓库 + 私有知识包”：

- 公共仓库保留程序、JSON schema、脱敏测试夹具和示例知识。
- 专业 handbooks、147 个方法块、真实案例、完整转写和 OCR 资料不再进入公共 Git 跟踪。
- 运行时知识目录由 `KNOWLEDGE_DIR` 指定，VPS 默认 `/opt/ip-commerce-knowledge`。
- 安装器支持 `KNOWLEDGE_BUNDLE_URL`、`KNOWLEDGE_BUNDLE_TOKEN`、`KNOWLEDGE_BUNDLE_SHA256`。
- 现有 VPS 升级先保留外部知识目录，不因程序升级覆盖知识。
- 新安装没有授权知识包时只进入“知识包未安装”管理状态，不允许生成低质量伪完整结果。
- 下载 token 只作为安装进程临时环境变量使用，不写入应用 `.env`、日志、systemd unit 或诊断输出。
- 项目学习规则继续按 userId 和 projectId 隔离，不允许把一个客户的实验数据加入另一个客户的知识上下文。

私有知识包只保存可复用机制和用户原创方法。第三方参考资料遵守：

- 保留痛点、结构、证明类型、节奏、CTA 和情绪转折等机制。
- 不把完整原句、独特表达、镜头顺序和创作者人格当作输出模板。
- 对高相似风险方法卡保留 originality note 和来源追踪。

公共历史已经包含的知识不能靠普通删除彻底收回。私有包验证完成后，再单独执行以下二选一操作，并在执行前再次确认：

- 推荐：创建干净历史并覆盖当前公共仓库。
- 备选：建立新的纯程序公共仓库并更新安装地址。

### 验收

- 新提交不再跟踪完整知识库、转写和 OCR 文件。
- 现有 VPS 升级后知识数量和生成效果不下降。
- 没有 token 的新 VPS 无法下载专业知识包。
- 公共测试仍可使用脱敏夹具完成构建和集成测试。

## 8. 前端、部署和安全

### 前端

- 把通用 fetch、错误解析、任务轮询提取到 `src/api/`。
- 把项目档案、实验、管理员和生成任务 UI 拆成独立 feature。
- 修正脚本、二创、拆解、洗稿的输入标题和步骤编号。
- IP 定位中的信任资产、内容条件、承接方式支持多选；行业、身份、产品和核心用户保持单选。
- 宽屏 `>= 1200px` 使用输入/结果双栏，结果区 sticky；窄屏保持上下结构。
- 手机端顶部操作区保留可滚动能力，并增加清晰的更多操作入口。
- 内容实验按模块过滤，项目级归档单独查看。
- 长任务显示当前步骤、正在尝试的模型、耗时和取消操作。

### 安全

- 关闭 `X-Powered-By`，增加安全响应头。
- 默认同源，不再无条件 `cors()`；通过 `APP_ALLOWED_ORIGINS` 显式开放。
- `TRUST_PROXY` 和 `COOKIE_SECURE=auto` 支持 HTTPS 反代。
- 登录按 IP + 用户名限流；生成按用户限流和并发控制。
- 服务端限制每个字段和请求的最大长度，拒绝 2MB 提示词滥用。
- API Key 只保存在 chmod 600 的服务端 `.env`，健康接口永不返回 Key。

### 部署

- 公共仓库下载改用 `codeload.github.com`，避免 GitHub API 429。
- 升级前停止 systemd 服务，再备份 `.env`、`data/` 和知识目录。
- 使用 staging 目录完成依赖安装、构建和知识校验，再原子切换版本。
- 任一步失败自动恢复上一版本并重新启动旧服务。
- systemd 使用专用非登录用户，并加入基础 hardening。
- Nginx 短期加入合理超时；异步 jobs 上线后普通 API 不再依赖长超时。
- 修复 Basic Auth 模式下无凭据 HEAD 健康检查必然返回 401 的问题。

### 验收

- 公开下载不再触发 GitHub API 限流路径。
- 升级过程中产生的用户数据不会写进旧备份目录后丢失。
- 模拟构建失败时可自动回滚。
- 登录暴力尝试和并发生成受到限制。
- 桌面和手机端浏览器均无溢出、遮挡或控制台错误。

## 分阶段实施

### 阶段 1：可靠性底座

- databaseStore、备份、配额预占。
- modelRouter、真实模型元数据和 fallback 测试。
- generation jobs、完整 4 步 Agent 链。
- 新 HTTP 集成测试。

阶段 1 完成后，长任务、429 和并发写入问题应先消失。

### 阶段 2：知识和学习闭环

- project learning rules。
- 完整知识校验和新 manifest。
- 质量评分收紧。
- 离线/真实模型测试分层。

### 阶段 3：前端模块化和体验

- 提取 API、hooks 和 feature 组件。
- 任务进度、实验过滤、正确字段和多选。
- 宽屏双栏、手机端更多操作。

### 阶段 4：私有知识和生产部署

- 私有 bundle 下载和外部知识目录。
- 公共仓库脱敏。
- 安全头、限流、专用用户、原子升级和回滚。
- README、安装和升级文档更新。

每阶段必须满足：

1. 新增测试先通过。
2. 全部旧测试继续通过。
3. `npm run build` 和生产模式 smoke test 通过。
4. 浏览器桌面/手机验证通过。
5. 阶段提交独立，出现问题可以回滚，不把四个阶段压成一个巨型提交。

## 最终验收标准

- 10 个模块、用户、项目、历史和现有数据保持兼容。
- 单次生成和 Agent 链不再受反代长请求限制。
- 429、5xx 和超时能按规则切换备用模型。
- 历史记录可追踪实际模型、耗时和尝试链。
- T+3 有效数据能影响下一次同项目生成。
- 数据库写入、备份和升级可恢复。
- 核心知识损坏会阻止部署和生成。
- 测试报告区分程序基准与真实模型质量。
- 公共仓库不再包含专业知识库和第三方完整表达。
- 前端模块边界清楚，`App.jsx`、`database.mjs` 不再继续增长为跨领域总文件。
