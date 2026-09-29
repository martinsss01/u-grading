"""Measure OCR quality and name detection of a model on your own sample scans.

Put samples in a folder (default: backend/eval_samples/, gitignored):

    eval_samples/
      labels.json           {"exam1.jpg": {"student_name": "Ana Pérez",
                                           "name_boxes": [[0.1, 0.05, 0.3, 0.04]]}, ...}
      exam1.jpg             a scanned page (.jpg/.png), or a multi-page .pdf
      exam1.txt             what the page actually says (hand-typed ground truth)

`name_boxes` ([x, y, width, height] as page fractions, one per place the name
appears) is optional; without it only "found a name at all" is checked.

Run inside the backend container (costs real API credits):
    python -m scripts.eval_llm --model anthropic/claude-opus-5 [--dir eval_samples]
"""

import argparse
import asyncio
import io
import json
import re
import unicodedata
from pathlib import Path

from PIL import Image

from app.services import llm
from app.services.pipeline import pdf_tools
from app.services.pipeline.ocr import OcrResult, ocr_page

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", text).strip()


def char_error_rate(expected: str, actual: str) -> float:
    """Levenshtein distance / len(expected), on whitespace-normalized text."""
    a, b = _normalize(expected), _normalize(actual)
    if not a:
        return 0.0 if not b else 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] / len(a)


def box_coverage(truth: list[float], found: list[OcrResult]) -> float:
    """Largest fraction of the true name box covered by any returned box."""
    tx, ty, tw, th = truth
    best = 0.0
    for result in found:
        for r in result.identity_regions:
            ix = max(0.0, min(tx + tw, r.x + r.width) - max(tx, r.x))
            iy = max(0.0, min(ty + th, r.y + r.height) - max(ty, r.y))
            best = max(best, (ix * iy) / (tw * th) if tw * th else 0.0)
    return best


def _pages(path: Path) -> list[bytes]:
    if path.suffix.lower() == ".pdf":
        return [pdf_tools.render_png(path, i) for i in range(pdf_tools.page_count(path))]
    buf = io.BytesIO()
    Image.open(path).convert("RGB").save(buf, format="PNG")
    return [buf.getvalue()]


async def main(model: str, folder: Path) -> None:
    labels = json.loads((folder / "labels.json").read_text()) if (folder / "labels.json").exists() else {}
    samples = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS | {".pdf"})
    if not samples:
        raise SystemExit(f"No samples in {folder}")

    rows = []
    for path in samples:
        label = labels.get(path.name, {})
        results = [await ocr_page(png, label.get("student_name"), model=model) for png in _pages(path)]
        text = "\n\n".join(r.text for r in results)
        truth = path.with_suffix(".txt")
        cer = char_error_rate(truth.read_text(), text) if truth.exists() else None
        boxes = label.get("name_boxes") or []
        coverage = [box_coverage(b, results) for b in boxes]
        rows.append(
            {
                "file": path.name,
                "cer": cer,
                "name_found": any(r.identity_regions for r in results),
                "name_boxes_covered": sum(c >= 0.8 for c in coverage) if boxes else None,
                "name_boxes": len(boxes),
                "confidence": ",".join(r.confidence for r in results),
            }
        )
        (folder / "eval_output").mkdir(exist_ok=True)
        (folder / "eval_output" / f"{path.stem}.{model.replace('/', '_')}.md").write_text(text)

    print(f"\nModel: {model}\n")
    print(f"{'file':30} {'CER':>6} {'name?':>6} {'boxes ok':>9} confidence")
    for r in rows:
        cer = f"{r['cer']:.1%}" if r["cer"] is not None else "—"
        boxes = f"{r['name_boxes_covered']}/{r['name_boxes']}" if r["name_boxes"] else "—"
        print(f"{r['file']:30} {cer:>6} {'yes' if r['name_found'] else 'NO':>6} {boxes:>9} {r['confidence']}")

    cers = [r["cer"] for r in rows if r["cer"] is not None]
    labelled = [r for r in rows if r["name_boxes"]]
    print()
    if cers:
        print(f"Mean character error rate: {sum(cers) / len(cers):.1%}  (lower is better)")
    if labelled:
        covered = sum(r["name_boxes_covered"] for r in labelled)
        total = sum(r["name_boxes"] for r in labelled)
        print(f"Name boxes covered >=80%: {covered}/{total}  (anonymization recall)")
    usage = llm.USAGE[model]
    print(f"Tokens: {usage['prompt_tokens']} in / {usage['completion_tokens']} out over {usage['calls']} calls")
    print(f"Transcriptions written to {folder / 'eval_output'}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True, help="OpenRouter model slug, e.g. anthropic/claude-opus-5")
    parser.add_argument("--dir", default="eval_samples", type=Path)
    args = parser.parse_args()
    asyncio.run(main(args.model, args.dir))
