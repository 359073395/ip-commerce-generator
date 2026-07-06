---
name: ip-commerce-knowledge-base
description: Use when the user asks to apply, summarize, expand, or continue learning a local short-video knowledge base for 个人IP, 带货视频, 账号定位, 短视频带货, 直播小黄车, TikTok Shop, 行业IP方案, 产品带货脚本, 视频课程学习, document/video ingestion, knowledge-base updates, mind maps, workflows, content matrices, scripts, filming checklists, or data review plans.
---

# IP Commerce Knowledge Base

## Core Rule

Use this skill as the operating system for the user's local `个人IP` and `带货视频` knowledge base.

Always classify work into only one or both of these categories:

- `个人IP`: positioning, persona, trust, expertise, content matrix, IP growth, consulting/private-domain conversion.
- `带货视频`: products, demand, sales logic, product-card/small-cart/live-room/TikTok conversion, CTR/CVR/GMV review.

Do not organize outputs by course names unless the user specifically asks for source tracing.

## Required References

Read only the reference needed for the task:

- For locating knowledge files and deciding which master handbook to use, read `references/knowledge-paths.md`.
- For continuing to learn from new videos, documents, spreadsheets, PDFs, OCR images, or folders, read `references/learning-workflow.md`.

When the user asks for an industry/product/account plan, first read the relevant local handbook listed in `knowledge-paths.md`, then answer with a concrete execution plan.

## Application Workflow

When the user asks for a plan, positioning, scripts, mind map, workflow, or content strategy:

1. Decide path:
   - Use `个人IP` when the request is about an expert, founder, lawyer, doctor, teacher, consultant, coach, service provider, creator persona, trust building, or long-term account identity.
   - Use `带货视频` when the request is about selling a product, TikTok Shop, small cart, live commerce, product card, store, local business promotion, conversion scripts, or GMV.
   - Use both only when the account is explicitly an IP that also needs product/service conversion.
2. Check whether the user gave enough information:
   - What is sold and the price?
   - Who is the target customer?
   - What proof, cases, credentials, reviews, or product evidence exists?
   - Can the user appear on camera, livestream, or show process/materials?
   - Where should conversion happen: comments, DM, form, store visit, small cart, live room, or private domain?
3. If information is insufficient, ask at most 5 high-impact questions.
4. If the user wants speed or gives only a broad industry, make reasonable assumptions and mark pending confirmations.
5. Output in execution order:
   - Information judgment
   - Positioning
   - Commercial path
   - Target user
   - Content matrix
   - Topic library
   - Scripts
   - Filming/editing checklist
   - Publishing and conversion handoff
   - Data review and next actions

## Output Standards

Prefer Chinese unless the user asks otherwise.

For `个人IP`, include:

- IP定位一句话
- 目标用户画像
- 人设资产 and trust proof
- 内容矩阵: 聊观点 / 教知识 / 晒过程 / 讲故事
- 选题生成: 人群 × 场景 × 痛点/情绪 × 爆款元素
- 3-5 scripts when requested or useful
- 拍摄剪辑清单
- 咨询/私域/直播承接
- 复盘: 播放、完播、互动、收藏、关注、咨询

For `带货视频`, include:

- 产品需求拆解
- 目标人群 and purchase situation
- 成交理由 and trust proof
- 内容矩阵: 种草 / 教知识带货 / 晒过程带货 / 测评 / 故事 / 观点 / 直播预热
- 成交链路: 激发兴趣 -> 创造需求 -> 赢得信任 -> 增强信念 -> 化解忧虑 -> 下单指令
- 商品视觉化拍摄清单
- 小黄车/商品卡/直播间/私域承接
- 复盘: CTR、CVR、GMV、GPM、CPA、ROAS、复购

Use Mermaid for mind maps or workflows when the user asks for 脑图, 流程图, or detailed structure.

## Continuing Learning

When the user provides new folders, videos, documents, screenshots, OCR images, spreadsheets, or course materials and asks to learn them:

1. Read `references/learning-workflow.md`.
2. Inventory all files before learning.
3. Convert documents to Markdown with appropriate document tooling.
4. Transcribe videos/audio when possible; do not rely on sampling as final learning unless the user explicitly accepts sampling.
5. OCR image-heavy material when needed.
6. Synthesize into `个人IP` and/or `带货视频`, not by source file name.
7. Update the local master handbooks and add a brief learning log or source note.
8. Report what was learned, what was unreadable, and which knowledge files were updated.

If a file is damaged or unsupported, record it clearly and continue with the readable material.
