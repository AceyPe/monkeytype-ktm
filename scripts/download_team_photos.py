#!/usr/bin/env python3
"""Download team photos from CSV Google Drive links into year folders as WebP.

Requires: pip install requests pillow pymupdf pillow-heif
(Raster images, PDF first page, and HEIC are converted to WebP.)
"""

from __future__ import annotations

import csv
import io
import re
import sys
from pathlib import Path

import requests
from PIL import Image

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None  # type: ignore

try:
    import pillow_heif
except ImportError:
    pillow_heif = None  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
TEAM = ROOT / "frontend" / "static" / "images" / "team"


def photos_column(fieldnames: list[str] | None) -> str:
    if not fieldnames:
        return "Photos URL"
    for key in fieldnames:
        if key and "photo" in key.lower():
            return key
    return "Photos URL"


def slug_name(name: str) -> str:
    name = name.replace("\xa0", " ").strip()
    if not name:
        return ""
    return "-".join(name.split())


def extract_drive_file_id(url: str) -> str | None:
    m = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if m:
        return m.group(1)
    return None


def is_drive_file_url(url: str) -> bool:
    u = url.strip()
    if not u or "drive.google.com" not in u:
        return False
    if "/folders/" in u:
        return False
    return bool(extract_drive_file_id(u))


def download_drive_bytes(file_id: str) -> bytes | None:
    session = requests.Session()
    url = "https://drive.google.com/uc"
    params: dict[str, str] = {"export": "download", "id": file_id}

    r = session.get(url, params=params, timeout=180)
    token = None
    for k, v in r.cookies.items():
        if k.startswith("download_warning"):
            token = v
            break
    if token:
        params["confirm"] = token
        r = session.get(url, params=params, timeout=180)

    data = r.content
    if len(data) < 1000 and (b"<html" in data[:500].lower() or b"<!DOCTYPE" in data[:500].lower()):
        text = data.decode("utf-8", errors="ignore")
        m = re.search(r"confirm=([0-9A-Za-z_-]+)&amp;|confirm=([0-9A-Za-z_-]+)", text)
        conf = (m.group(1) or m.group(2)) if m else None
        if conf:
            params2 = {"export": "download", "id": file_id, "confirm": conf}
            r = session.get(url, params=params2, timeout=180)
            data = r.content

    if len(data) < 100:
        return None
    if b"<html" in data[:800].lower() and b"PNG" not in data[:20] and b"JFIF" not in data[:20]:
        return None
    return data


def load_pil_image(data: bytes) -> Image.Image:
    """Decode raster, PDF (first page), or HEIC to a Pillow image."""
    bio = io.BytesIO(data)
    try:
        return Image.open(bio)
    except Exception:
        pass

    if data[:4] == b"%PDF":
        if fitz is None:
            raise RuntimeError("PyMuPDF required for PDF (pip install pymupdf)")
        doc = fitz.open(stream=data, filetype="pdf")
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=150)
        if pix.alpha:
            return Image.frombytes("RGBA", [pix.width, pix.height], pix.samples)
        return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    if pillow_heif is not None:
        pillow_heif.register_heif_opener()
        return Image.open(io.BytesIO(data))

    raise RuntimeError("Unsupported image format (try: pip install pillow-heif)")


def bytes_to_webp(data: bytes, dest: Path) -> bool:
    try:
        im = load_pil_image(data)
        if im.mode not in ("RGB", "RGBA"):
            if im.mode == "P" and "transparency" in im.info:
                im = im.convert("RGBA")
            else:
                im = im.convert("RGBA" if im.mode in ("LA", "PA") else "RGB")
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "WEBP", quality=88, method=6)
        return True
    except Exception as e:
        print(f"  image decode/save failed: {e}", file=sys.stderr)
        return False


def process_csv(year: str) -> None:
    csv_path = TEAM / f"{year}.csv"
    if not csv_path.exists():
        print(f"Missing {csv_path}", file=sys.stderr)
        return
    out_dir = TEAM / year
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(csv_path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        col = photos_column(r.fieldnames)
        rows = list(r)

    for row in rows:
        name = (row.get("Name") or "").replace("\xa0", " ").strip()
        url = (row.get(col) or "").strip()
        if not name:
            continue
        if not is_drive_file_url(url):
            if url:
                print(f"[{year}] skip {name}: not a Drive file URL")
            continue

        fid = extract_drive_file_id(url)
        if not fid:
            print(f"[{year}] skip {name}: could not parse file id")
            continue

        slug = slug_name(name)
        if not slug:
            continue
        dest = out_dir / f"{slug}.webp"

        print(f"[{year}] {name} -> {dest.name} ...")
        raw = download_drive_bytes(fid)
        if raw is None:
            print(f"  download failed", file=sys.stderr)
            continue
        if not bytes_to_webp(raw, dest):
            continue
        print(f"  ok ({dest.stat().st_size} bytes)")


def main() -> None:
    for year in ("2022", "2024", "2025", "2026"):
        process_csv(year)


if __name__ == "__main__":
    main()
