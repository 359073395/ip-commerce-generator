# Knowledge Paths

Use these paths as the local source of truth for the user's short-video knowledge base.

## Workspace

Root workspace:

```text
C:\Users\w'k'r\Documents\New project
```

Knowledge base root:

```text
C:\Users\w'k'r\Documents\New project\知识库
```

## Primary Handbooks

Use these first when answering user requests.

When running on a server or another agent that cannot access the user's Windows workspace, use the bundled portable handbooks in this skill first:

```text
references/personal-ip-handbook.md
references/commerce-video-handbook.md
```

If the full package is installed, use this bundled readable knowledge base for the most detailed lookup:

```text
references/full-knowledge-base/
```

It contains the readable Markdown/JSON/CSV/JSONL knowledge outputs copied from the user's local knowledge base, including master handbooks, method libraries, course notes, full transcripts, OCR outputs, asset manifests, templates, and TikTok materials. It intentionally excludes raw video/audio/binary course files; use the converted text artifacts inside this folder.

### 个人IP

```text
C:\Users\w'k'r\Documents\New project\知识库\总知识库\个人IP全知识库详细脑图和流程.md
```

Use for:

- personal brand/IP positioning
- founder/expert/creator accounts
- lawyer, doctor, teacher, consultant, coach, founder, local expert accounts
- persona, credibility, trust, private-domain or consultation conversion
- content matrix, topics, scripts, filming plans, review logic

Portable fallback:

```text
references/personal-ip-handbook.md
```

### 带货视频

```text
C:\Users\w'k'r\Documents\New project\知识库\总知识库\带货视频全知识库详细脑图和流程.md
```

Use for:

- product-selling short videos
- TikTok Shop
- live commerce and 小黄车
- product cards, CTR/CVR/GMV optimization
- entity store selling videos
- product demand,成交理由, trust proof, product visualization

Portable fallback:

```text
references/commerce-video-handbook.md
```

### Combined Backup

```text
C:\Users\w'k'r\Documents\New project\知识库\总知识库\个人IP与带货视频全知识库详细脑图和流程.md
```

Use only when a task clearly needs both categories and the separate handbooks are insufficient.

## Supporting Files

Use these when more detail is needed.

```text
C:\Users\w'k'r\Documents\New project\知识库\新学习资料\个人IP\个人IP方法库.md
C:\Users\w'k'r\Documents\New project\知识库\新学习资料\个人IP\爆款选题与脚本卡片库.md
C:\Users\w'k'r\Documents\New project\知识库\新学习资料\个人IP\素材采集与拆片流程.md
C:\Users\w'k'r\Documents\New project\知识库\新学习资料\带货视频\带货视频方法库.md
C:\Users\w'k'r\Documents\New project\知识库\新学习资料\带货视频\TikTok运营方法库.md
C:\Users\w'k'r\Documents\New project\知识库\新学习资料\应用模板\增强版IP定位采集表.md
C:\Users\w'k'r\Documents\New project\知识库\新学习资料\应用模板\行业方案默认输出模板.md
```

Portable full-package equivalents live under:

```text
references/full-knowledge-base/
```

Search this folder when the user asks for the most detailed, most complete answer or when the two portable handbooks are not enough.

## Answer Routing

Use `个人IP` if the main asset is a person.

Use `带货视频` if the main asset is a product, product card, store, live room, or transaction path.

Use both if the user wants an expert/founder account whose content must also sell a product or service.

Do not ask the user to choose the category unless the commercial goal is truly ambiguous.
