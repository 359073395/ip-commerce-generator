from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import av
from faster_whisper import WhisperModel


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".wmv", ".flv", ".m4v", ".ts"}


@dataclass
class VideoItem:
    id: str
    title: str
    path: str
    bytes: int
    duration_seconds: float | None
    category: str
    topic: str


def safe_stem(text: str) -> str:
    text = re.sub(r"[\\/:*?\"<>|]+", "_", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:120]


def detect_duration(path: Path) -> float | None:
    try:
        with av.open(str(path)) as container:
            if container.duration is None:
                return None
            return float(container.duration / av.time_base)
    except Exception:
        return None


def classify(title: str) -> tuple[str, str]:
    commerce_keys = ["带货", "直播", "私域", "全域", "实体店", "运营", "增长", "成交", "流量"]
    ip_keys = ["IP", "ip", "素人", "人设", "文案", "新媒体", "短视频", "爆款", "自动化生产线"]

    commerce_score = sum(1 for key in commerce_keys if key in title)
    ip_score = sum(1 for key in ip_keys if key in title)

    if commerce_score > ip_score:
        category = "带货类"
    elif ip_score > commerce_score:
        category = "个人IP类"
    else:
        category = "个人IP类" if "IP" in title or "ip" in title else "带货类"

    topic = title
    topic = re.sub(r"^\d+[.．、]?", "", topic)
    topic = topic.replace("_1", "")
    return category, topic


def iter_videos(root: Path) -> list[Path]:
    return sorted(
        [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS],
        key=lambda p: p.name,
    )


def format_time(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def write_manifest(videos: list[VideoItem], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(
        json.dumps([asdict(v) for v in videos], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    rows = [
        "# 本地课程视频清单",
        "",
        "| ID | 分类 | 主题 | 时长 | 文件 |",
        "|---|---|---|---|---|",
    ]
    for item in videos:
        duration = format_time(item.duration_seconds or 0) if item.duration_seconds else "未知"
        rows.append(f"| {item.id} | {item.category} | {item.topic} | {duration} | `{item.path}` |")
    (out_dir / "视频清单.md").write_text("\n".join(rows) + "\n", encoding="utf-8")


def transcribe_one(model: WhisperModel, item: VideoItem, out_dir: Path, beam_size: int) -> None:
    stem = safe_stem(f"{item.id}_{item.title}")
    json_path = out_dir / f"{stem}.json"
    md_path = out_dir / f"{stem}.md"

    if json_path.exists() and md_path.exists():
        print(f"SKIP {item.id} {item.title}", flush=True)
        return

    print(f"TRANSCRIBE {item.id} {item.title}", flush=True)
    segments_iter, info = model.transcribe(
        item.path,
        language="zh",
        vad_filter=True,
        beam_size=beam_size,
        temperature=0,
    )

    segments = []
    for segment in segments_iter:
        text = segment.text.strip()
        if not text:
            continue
        segments.append(
            {
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
            }
        )

    payload = {
        "item": asdict(item),
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
        "segments": segments,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"# {item.title}",
        "",
        "## Source",
        "",
        f"- 文件：`{item.path}`",
        f"- 分类：{item.category}",
        f"- 主题：{item.topic}",
        f"- 时长：{format_time(item.duration_seconds or 0) if item.duration_seconds else '未知'}",
        f"- 识别语言：{getattr(info, 'language', None)}",
        "",
        "## Transcript",
        "",
    ]
    for segment in segments:
        lines.append(f"- [{format_time(segment['start'])}-{format_time(segment['end'])}] {segment['text']}")
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="Folder containing local videos.")
    parser.add_argument("--out", default="知识库/素材/转写", help="Output folder.")
    parser.add_argument("--model", default="base", help="faster-whisper model size or path.")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--limit", type=int, default=0, help="Only process the first N videos.")
    parser.add_argument("--manifest-only", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        print(f"Video folder not found: {root}", file=sys.stderr)
        return 1

    out_dir = Path(args.out)
    paths = iter_videos(root)
    if args.limit:
        paths = paths[: args.limit]

    videos: list[VideoItem] = []
    for idx, path in enumerate(paths, start=1):
        category, topic = classify(path.stem)
        videos.append(
            VideoItem(
                id=f"V{idx:03d}",
                title=path.stem,
                path=str(path),
                bytes=path.stat().st_size,
                duration_seconds=detect_duration(path),
                category=category,
                topic=topic,
            )
        )

    write_manifest(videos, out_dir)
    if args.manifest_only:
        return 0

    print(f"Loading model: {args.model}", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    for item in videos:
        transcribe_one(model, item, out_dir, args.beam_size)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
