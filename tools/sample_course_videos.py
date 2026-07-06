from __future__ import annotations

import argparse
import json
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
class Sample:
    label: str
    start: float
    duration: float
    transcript: str


@dataclass
class VideoBrief:
    id: str
    title: str
    path: str
    duration_seconds: float | None
    category: str
    topic: str
    samples: list[Sample]


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


def format_time(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def iter_videos(root: Path) -> list[Path]:
    return sorted(
        [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS],
        key=lambda p: p.name,
    )


def sample_points(duration: float | None, window: float) -> list[tuple[str, float]]:
    if not duration or duration <= window:
        return [("全段", 0)]
    points = [
        ("开头", 60 if duration > 180 else 0),
        ("中段", max(0, duration * 0.50 - window / 2)),
        ("结尾", max(0, duration - window - 90)),
    ]
    seen: set[int] = set()
    result = []
    for label, start in points:
        key = int(start // 10)
        if key not in seen:
            result.append((label, start))
            seen.add(key)
    return result


def extract_wav(ffmpeg: str, src: Path, start: float, duration: float, dst: Path) -> None:
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(max(0, start)),
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


def transcribe_audio(model: WhisperModel, wav: Path) -> str:
    segments, _ = model.transcribe(
        str(wav),
        language="zh",
        vad_filter=True,
        beam_size=1,
        temperature=0,
    )
    return "".join(segment.text.strip() for segment in segments if segment.text.strip())


def safe_stem(text: str) -> str:
    text = re.sub(r"[\\/:*?\"<>|]+", "_", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:120]


def write_brief(brief: VideoBrief, out_dir: Path) -> None:
    stem = safe_stem(f"{brief.id}_{brief.title}")
    json_path = out_dir / f"{stem}.json"
    md_path = out_dir / f"{stem}.md"
    payload = asdict(brief)
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"# {brief.title}",
        "",
        "## Source",
        "",
        f"- 文件：`{brief.path}`",
        f"- 分类：{brief.category}",
        f"- 主题：{brief.topic}",
        f"- 时长：{format_time(brief.duration_seconds or 0) if brief.duration_seconds else '未知'}",
        "",
        "## Sample Transcript",
        "",
    ]
    for sample in brief.samples:
        lines.extend(
            [
                f"### {sample.label} {format_time(sample.start)}",
                "",
                sample.transcript or "未识别到清晰语音。",
                "",
            ]
        )
    md_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--out", default="知识库/素材/抽样转写")
    parser.add_argument("--model", default="tiny")
    parser.add_argument("--window", type=float, default=75)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    root = Path(args.root)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    paths = iter_videos(root)
    if args.limit:
        paths = paths[: args.limit]

    print(f"Loading model: {args.model}", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    all_briefs: list[VideoBrief] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for idx, path in enumerate(paths, start=1):
            title = path.stem
            category, topic = classify(title)
            duration = detect_duration(path)
            print(f"SAMPLE V{idx:03d} {title}", flush=True)
            samples: list[Sample] = []
            for label, start in sample_points(duration, args.window):
                wav = tmp_dir / f"sample_{idx}_{label}.wav"
                extract_wav(ffmpeg, path, start, args.window, wav)
                transcript = transcribe_audio(model, wav)
                samples.append(Sample(label=label, start=start, duration=args.window, transcript=transcript))
            brief = VideoBrief(
                id=f"V{idx:03d}",
                title=title,
                path=str(path),
                duration_seconds=duration,
                category=category,
                topic=topic,
                samples=samples,
            )
            write_brief(brief, out_dir)
            all_briefs.append(brief)

    (out_dir / "all_samples.json").write_text(
        json.dumps([asdict(item) for item in all_briefs], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
