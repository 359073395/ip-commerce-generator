from __future__ import annotations

import argparse
import re
from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_block_items(parent):
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P

    for child in parent.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def clean_cell(text: str) -> str:
    text = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    return text.replace("|", "\\|")


def paragraph_to_md(paragraph: Paragraph) -> str:
    text = paragraph.text.strip()
    if not text:
        return ""

    style = paragraph.style.name if paragraph.style is not None else ""
    if style.startswith("Heading"):
        match = re.search(r"(\d+)", style)
        level = int(match.group(1)) if match else 2
        level = max(1, min(level, 6))
        return f"{'#' * level} {text}"

    if style in {"Title", "Subtitle"}:
        return f"# {text}" if style == "Title" else f"## {text}"

    return text


def table_to_md(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells = [clean_cell(cell.text) for cell in row.cells]
        rows.append(cells)
    if not rows:
        return ""

    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    header = rows[0]
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
    for row in rows[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def convert(src: Path, dst: Path) -> None:
    doc = Document(str(src))
    lines = [
        "---",
        f"source: {src}",
        "type: docx",
        "---",
        f"# {src.stem}",
        "",
    ]

    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            md = paragraph_to_md(block)
        else:
            md = table_to_md(block)
        if md:
            lines.extend([md, ""])

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--dst", required=True)
    args = parser.parse_args()
    convert(Path(args.src), Path(args.dst))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
