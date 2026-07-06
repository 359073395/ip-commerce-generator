from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def safe_name(text: str) -> str:
    text = re.sub(r"[\\/:*?\"<>|]+", "_", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:140] or "image"


def should_skip(item: dict) -> bool:
    rel = str(item.get("relative_path", ""))
    ext = str(item.get("extension", "")).lower()
    if ext not in IMAGE_EXTENSIONS:
        return True
    if rel.startswith("100套面试简历模板"):
        return True
    return False


def ocr_image(engine: RapidOCR, path: Path, min_confidence: float) -> tuple[list[str], list[dict]]:
    result, _ = engine(str(path))
    lines: list[str] = []
    raw: list[dict] = []
    if not result:
        return lines, raw
    for box, text, score in result:
        item = {"text": text, "score": float(score), "box": box}
        raw.append(item)
        if float(score) >= min_confidence and str(text).strip():
            lines.append(str(text).strip())
    return lines, raw


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--min-confidence", type=float, default=0.55)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    inventory_path = Path(args.inventory)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    items = json.loads(inventory_path.read_text(encoding="utf-8"))
    image_items = [item for item in items if not should_skip(item)]
    if args.limit:
        image_items = image_items[: args.limit]

    engine = RapidOCR()
    report: list[dict] = []
    combined_lines = [
        "# 图片资料 OCR 汇总",
        "",
        "说明：本文件仅汇总非简历模板图片。原始图片路径保留在每个条目中。",
        "",
    ]

    for item in image_items:
        src = Path(str(item["full_path"]))
        out_name = f"{item['id']}_{safe_name(src.stem)}.md"
        md_path = out_dir / out_name
        json_path = out_dir / f"{item['id']}_{safe_name(src.stem)}.json"

        try:
            lines, raw = ocr_image(engine, src, args.min_confidence)
            payload = {"item": item, "lines": lines, "raw": raw}
            json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

            md = [
                "---",
                f"id: {item['id']}",
                f"source: {item['full_path']}",
                f"initial_category: {item.get('initial_category', '')}",
                "---",
                f"# {src.stem}",
                "",
                "## OCR Text",
                "",
            ]
            md.extend(lines or ["未识别到高置信度文字。"])
            md_path.write_text("\n".join(md) + "\n", encoding="utf-8")

            combined_lines.extend([f"## {item['id']} {src.stem}", "", f"- 来源：`{item['full_path']}`", ""])
            combined_lines.extend(lines[:80] or ["未识别到高置信度文字。"])
            combined_lines.append("")
            report.append({"id": item["id"], "path": str(src), "status": "ok", "line_count": len(lines)})
            print(f"OK {item['id']} lines={len(lines)} {src.name}", flush=True)
        except Exception as exc:
            report.append({"id": item["id"], "path": str(src), "status": "failed", "error": repr(exc)})
            print(f"FAILED {item['id']} {src.name} {exc!r}", flush=True)

    (out_dir / "_ocr_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "_图片资料OCR汇总.md").write_text("\n".join(combined_lines), encoding="utf-8")
    print(f"DONE images={len(image_items)} out={out_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
