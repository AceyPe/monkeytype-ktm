#!/usr/bin/env python3
"""Sync team-data CSVs to years/*.ts, download Google Drive photos, expect optimize-images run."""

from __future__ import annotations

import csv
import imghdr
import json
import os
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path

import gdown

ROOT = Path(__file__).resolve().parents[1]
TEAM_DATA = ROOT / "frontend/src/ts/pages/team-data"
STATIC_TEAM = ROOT / "frontend/static/images/team"

EXT_MAP = {"jpeg": ".jpg", "png": ".png", "gif": ".gif", "webp": ".webp", "bmp": ".bmp"}


def ts_str(s: str) -> str:
    return json.dumps(s)


def norm_linkedin(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return ""
    if s.startswith("http://") or s.startswith("https://"):
        return s
    if s.startswith("www."):
        return "https://" + s
    return "https://" + s


def safe_name(name: str) -> str:
    return "-".join(name.split())


def is_google_drive_photo_url(url: str) -> bool:
    u = (url or "").strip().lower()
    if not u:
        return False
    if "drive.google.com/drive/folders/" in u:
        return False
    if "linkedin.com" in u and "drive.google" not in u:
        return False
    return "drive.google.com" in u or "google.com/open?id=" in u


def download_photo(url: str, dest_no_ext: Path) -> Path | None:
    dest_no_ext.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest_no_ext.parent / f".{dest_no_ext.name}.tmp"
    try:
        downloaded = gdown.download(url=url, output=str(tmp), quiet=True)
        if not downloaded or not tmp.exists() or tmp.stat().st_size == 0:
            if tmp.exists():
                tmp.unlink()
            return None
        kind = imghdr.what(tmp)
        ext = EXT_MAP.get(kind, ".jpg")
        final = dest_no_ext.parent / f"{dest_no_ext.name}{ext}"
        if final.exists():
            final.unlink()
        os.replace(tmp, final)
        return final
    except Exception:
        if tmp.exists():
            tmp.unlink()
        return None


def clear_year_images(year: str) -> None:
    d = STATIC_TEAM / year
    if not d.exists():
        d.mkdir(parents=True, exist_ok=True)
        return
    for f in d.iterdir():
        if f.is_file():
            f.unlink()


def remove_webp_when_raster_pair_exists() -> None:
    """Remove .webp only if a same-stem .jpg/.jpeg/.png exists so optimize-images can recreate webp."""
    if not STATIC_TEAM.exists():
        return
    for p in STATIC_TEAM.rglob("*.webp"):
        stem = p.stem
        parent = p.parent
        if (
            (parent / f"{stem}.jpg").exists()
            or (parent / f"{stem}.jpeg").exists()
            or (parent / f"{stem}.png").exists()
        ):
            p.unlink()


def webp_path_for_name(year: str, name: str) -> str:
    base = safe_name(name)
    p = STATIC_TEAM / year / f"{base}.webp"
    if p.exists():
        return f"/images/team/{year}/{p.name}"
    return ""


def read_rows_simple(
    path: Path,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("Name") or "").strip()
            if not name:
                continue
            rows.append(
                {
                    "name": name,
                    "title": (row.get("Position") or "").strip(),
                    "linkedin": norm_linkedin(row.get("LinkedIn URL") or ""),
                    "category": (row.get("Category") or "").strip(),
                    "photo": (row.get("Photos URL") or "").strip(),
                }
            )
    return rows


def read_rows_2026(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("Name") or "").strip()
            if not name:
                continue
            rows.append(
                {
                    "name": name,
                    "title": (row.get("Position") or "").strip(),
                    "linkedin": norm_linkedin(row.get("LinkedIn URL") or ""),
                    "region": (row.get("Region") or "").strip(),
                    "section": (row.get("Section") or "").strip(),
                    "category": (row.get("Category") or "").strip(),
                    "photo": (row.get("Photos URL") or "").strip(),
                }
            )
    return rows


def group_by_category(rows: list[dict[str, str]]) -> OrderedDict[str, list[dict[str, str]]]:
    out: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
    for row in rows:
        cat = row["category"] or "Other"
        out.setdefault(cat, []).append(row)
    return out


def write_2026(sections: OrderedDict[str, list[dict[str, str]]], images: dict[str, str]) -> None:
    lines = [
        'import type { TeamSection } from "../types";',
        "",
        "export const year2026: TeamSection[] = [",
    ]
    for cat, items in sections.items():
        lines.append("  {")
        lines.append(f"    title: {ts_str(cat)},")
        lines.append("    items: [")
        for row in items:
            name = row["name"]
            ip = images.get(name, "")
            lines.append("      {")
            lines.append(f"        name: {ts_str(name)},")
            lines.append(f"        title: {ts_str(row['title'])},")
            lines.append(f"        imagePath: {ts_str(ip)},")
            lines.append(f"        linkedin: {ts_str(row['linkedin'])},")
            lines.append(f"        region: {ts_str(row['region'])},")
            lines.append(f"        section: {ts_str(row['section'])},")
            lines.append("      },")
        lines.append("    ],")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    out = TEAM_DATA / "years/2026.ts"
    out.write_text("\n".join(lines), encoding="utf-8")


def write_simple(
    filename: str,
    export_name: str,
    sections: OrderedDict[str, list[dict[str, str]]],
    images: dict[str, str],
) -> None:
    lines = [
        'import type { TeamSection } from "../types";',
        "",
        f"export const {export_name}: TeamSection[] = [",
    ]
    for cat, items in sections.items():
        lines.append("  {")
        lines.append(f"    title: {ts_str(cat)},")
        lines.append("    items: [")
        for row in items:
            name = row["name"]
            ip = images.get(name, "")
            li = row["linkedin"]
            multiline = len(li) > 96
            lines.append("      {")
            lines.append(f"        name: {ts_str(name)},")
            lines.append(f"        title: {ts_str(row['title'])},")
            lines.append(f"        imagePath: {ts_str(ip)},")
            if multiline:
                lines.append("        linkedin:")
                lines.append(f"          {ts_str(li)},")
            else:
                lines.append(f"        linkedin: {ts_str(li)},")
            lines.append("      },")
        lines.append("    ],")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    out = TEAM_DATA / f"years/{filename}"
    out.write_text("\n".join(lines), encoding="utf-8")


def run_optimize() -> None:
    subprocess.run(
        ["npm", "run", "optimize-images", "--", "./frontend/static/images/team"],
        cwd=str(ROOT),
        check=True,
    )


def main() -> int:
    years_config = [
        ("2022", "year2022", "2022.csv", "simple"),
        ("2024", "year2024", "2024.csv", "simple"),
        ("2025", "year2025", "2025.csv", "simple"),
        ("2026", "year2026", "2026.csv", "2026"),
    ]

    for year, _export, _csv, _mode in years_config:
        clear_year_images(year)

    # Download
    for year, _export, csv_name, mode in years_config:
        path = TEAM_DATA / csv_name
        if mode == "2026":
            rows = read_rows_2026(path)
        else:
            rows = read_rows_simple(path)
        for row in rows:
            url = row.get("photo", "")
            if not is_google_drive_photo_url(url):
                continue
            dest = STATIC_TEAM / year / safe_name(row["name"])
            download_photo(url, dest)

    remove_webp_when_raster_pair_exists()
    run_optimize()

    # Write TS with final webp paths
    for year, export, csv_name, mode in years_config:
        path = TEAM_DATA / csv_name
        if mode == "2026":
            rows = read_rows_2026(path)
            sections = group_by_category(rows)
            images = {r["name"]: webp_path_for_name(year, r["name"]) for r in rows}
            write_2026(sections, images)
        else:
            rows = read_rows_simple(path)
            sections = group_by_category(rows)
            images = {r["name"]: webp_path_for_name(year, r["name"]) for r in rows}
            write_simple(f"{year}.ts", export, sections, images)

    return 0


if __name__ == "__main__":
    sys.exit(main())
