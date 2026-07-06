from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path


ROOTS = [
    Path(r"E:\BaiduNetdiskDownload\26年6月30000元64节最新线下编导训练中心视频课完整版"),
    Path(r"E:\BaiduNetdiskDownload\26年6月新增：薛辉价值30000 线下达人班"),
    Path(r"E:\BaiduNetdiskDownload\26年6月最新直播间小黄车39精品账号定位课"),
]

OUT_DIR = Path(r"C:\Users\w'k'r\Documents\New project\知识库\新学习资料")
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".wmv", ".flv", ".m4v", ".ts"}
DOC_EXTS = {".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".xls", ".csv", ".wps"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


@dataclass
class InventoryItem:
    id: str
    source_root: str
    relative_path: str
    name: str
    extension: str
    media_type: str
    size_bytes: int
    initial_category: str
    full_path: str


def media_type_for(ext: str) -> str:
    ext = ext.lower()
    if ext in VIDEO_EXTS:
        return "video"
    if ext in DOC_EXTS:
        return "document"
    if ext in IMAGE_EXTS:
        return "image"
    return "other"


def initial_category(path: Path) -> str:
    text = str(path).lower()
    commerce_keys = [
        "带货",
        "小黄车",
        "直播",
        "成交",
        "电商",
        "投放",
        "实体店",
        "账号定位课",
        "产品",
        "选品",
    ]
    ip_keys = [
        "ip",
        "达人",
        "编导",
        "观点",
        "故事",
        "知识",
        "过程",
        "文案",
        "表现力",
        "拍摄",
        "剪辑",
        "素材库",
        "账号规划",
    ]
    commerce_score = sum(1 for key in commerce_keys if key in text)
    ip_score = sum(1 for key in ip_keys if key in text)
    if commerce_score > ip_score:
        return "带货视频"
    if ip_score > commerce_score:
        return "个人IP"
    return "待判定"


def iter_items() -> list[InventoryItem]:
    items: list[InventoryItem] = []
    counter = 1
    for root in ROOTS:
        if not root.exists():
            continue
        for path in sorted((p for p in root.rglob("*") if p.is_file()), key=lambda p: str(p)):
            ext = path.suffix.lower()
            item = InventoryItem(
                id=f"N{counter:04d}",
                source_root=str(root),
                relative_path=str(path.relative_to(root)),
                name=path.name,
                extension=ext,
                media_type=media_type_for(ext),
                size_bytes=path.stat().st_size,
                initial_category=initial_category(path),
                full_path=str(path),
            )
            items.append(item)
            counter += 1
    return items


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    items = iter_items()

    json_path = OUT_DIR / "资产清单.json"
    csv_path = OUT_DIR / "资产清单.csv"
    md_path = OUT_DIR / "资产清单.md"

    json_path.write_text(
        json.dumps([asdict(item) for item in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(items[0]).keys()) if items else [])
        if items:
            writer.writeheader()
            writer.writerows(asdict(item) for item in items)

    counts: dict[tuple[str, str], int] = {}
    for item in items:
        key = (item.media_type, item.extension)
        counts[key] = counts.get(key, 0) + 1

    lines = [
        "# 新学习资料资产清单",
        "",
        "## 来源目录",
        "",
    ]
    for root in ROOTS:
        lines.append(f"- `{root}`")
    lines.extend(["", "## 文件类型统计", ""])
    for (media_type, ext), count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"- {media_type} / `{ext or '(no extension)'}`：{count}")
    lines.extend(["", "## 学习分类规则", ""])
    lines.append("- 一级分类只使用：`带货视频`、`个人IP`。")
    lines.append("- 文件名和课程名只作为来源元数据，不作为知识库一级分类。")
    lines.append("- `待判定` 项会在学习内容后按知识用途归入两类之一。")
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"items={len(items)}")
    print(json_path)
    print(csv_path)
    print(md_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
