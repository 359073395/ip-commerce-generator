from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path

import av
import imageio_ffmpeg
from faster_whisper import WhisperModel


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".wmv", ".flv", ".m4v", ".ts"}


@dataclass
class ChunkResult:
    index: int
    start: float
    end: float
    text: str


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
    topic = re.sub(r"^\d+[.．、]?", "", title).replace("_1", "")
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


def extract_wav(ffmpeg: str, src: Path, start: float, duration: float, dst: Path) -> None:
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(start),
        "-t",
        str(duration),
        "-i",
        str(src),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-y",
        str(dst),
    ]
    subprocess.run(cmd, check=True)


def transcribe_wav(model: WhisperModel, wav: Path) -> str:
    segments, _ = model.transcribe(
        str(wav),
        language="zh",
        vad_filter=True,
        beam_size=1,
        temperature=0,
    )
    return "".join(segment.text.strip() for segment in segments if segment.text.strip())


def read_completed(jsonl_path: Path) -> dict[int, ChunkResult]:
    completed: dict[int, ChunkResult] = {}
    if not jsonl_path.exists():
        return completed
    for line in jsonl_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        completed[int(item["index"])] = ChunkResult(
            index=int(item["index"]),
            start=float(item["start"]),
            end=float(item["end"]),
            text=str(item["text"]),
        )
    return completed


def write_outputs(
    md_path: Path,
    meta_path: Path,
    title: str,
    src: Path,
    category: str,
    topic: str,
    duration: float | None,
    chunks: list[ChunkResult],
) -> None:
    meta = {
        "title": title,
        "source": str(src),
        "category": category,
        "topic": topic,
        "duration_seconds": duration,
        "chunks": [asdict(chunk) for chunk in chunks],
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"# {title}",
        "",
        "## Source",
        "",
        f"- 文件：`{src}`",
        f"- 分类：{category}",
        f"- 主题：{topic}",
        f"- 时长：{format_time(duration or 0) if duration else '未知'}",
        "",
        "## Transcript",
        "",
    ]
    for chunk in chunks:
        lines.append(f"### {format_time(chunk.start)}-{format_time(chunk.end)}")
        lines.append("")
        lines.append(chunk.text or "未识别到清晰语音。")
        lines.append("")
    md_path.write_text("\n".join(lines), encoding="utf-8")


def transcribe_video(
    model: WhisperModel,
    ffmpeg: str,
    video_id: str,
    src: Path,
    out_dir: Path,
    chunk_seconds: float,
) -> None:
    title = src.stem
    category, topic = classify(title)
    duration = detect_duration(src)
    if not duration:
        print(f"SKIP_NO_DURATION {video_id} {title}", flush=True)
        return

    stem = safe_stem(f"{video_id}_{title}")
    jsonl_path = out_dir / f"{stem}.chunks.jsonl"
    md_path = out_dir / f"{stem}.md"
    meta_path = out_dir / f"{stem}.json"

    total_chunks = int(math.ceil(duration / chunk_seconds))
    completed = read_completed(jsonl_path)
    print(f"VIDEO {video_id} {title} chunks={total_chunks}", flush=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for index in range(total_chunks):
            if index in completed:
                continue
            start = index * chunk_seconds
            end = min(duration, start + chunk_seconds)
            wav = tmp_dir / f"{stem}_{index:03d}.wav"
            extract_wav(ffmpeg, src, start, end - start, wav)
            text = transcribe_wav(model, wav)
            result = ChunkResult(index=index, start=start, end=end, text=text)
            with jsonl_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(asdict(result), ensure_ascii=False) + "\n")
            completed[index] = result
            print(f"DONE {video_id} chunk {index + 1}/{total_chunks} {format_time(start)}-{format_time(end)}", flush=True)

    chunks = [completed[index] for index in sorted(completed)]
    write_outputs(md_path, meta_path, title, src, category, topic, duration, chunks)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--out", default="知识库/素材/完整转写")
    parser.add_argument("--model", default="tiny")
    parser.add_argument("--chunk-seconds", type=float, default=300)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    root = Path(args.root)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    paths = iter_videos(root)
    if args.limit:
        paths = paths[: args.limit]

    print(f"Loading model: {args.model}", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    for idx, path in enumerate(paths, start=1):
        transcribe_video(model, ffmpeg, f"V{idx:03d}", path, out_dir, args.chunk_seconds)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
