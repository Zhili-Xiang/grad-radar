#!/usr/bin/env python3
"""合并 data/raw/*.json -> data/programs.json

raw 文件约定：每个来源一个纯 JSON 数组（允许包在 ```json 围栏里），
字段见各抓取 agent 的输出规范。重复 URL 去重，firstSeen 从旧库继承。
用法：python3 scripts/build_data.py
"""
import json
import re
import datetime
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "programs.json"
TODAY = datetime.date.today().isoformat()

KEEP = ["category", "school", "schoolShort", "institute", "title", "degree", "url",
        "publishedAt", "deadline", "startDate", "location", "highlights", "tags",
        "snippet", "source", "dateEstimated"]
CAMP_DEGREES = {"夏令营", "冬令营", "暑校", "学习班"}


def norm_date(v):
    if not v:
        return None
    s = str(v).strip()
    for pat in (r"(\d{4})-(\d{1,2})-(\d{1,2})", r"(\d{4})\.(\d{1,2})\.(\d{1,2})",
                r"(\d{4})年(\d{1,2})月(\d{1,2})日"):
        m = re.match(pat, s)
        if m:
            y, mo, d = (int(x) for x in m.groups())
            if 1900 < y < 2100 and 1 <= mo <= 12 and 1 <= d <= 31:
                return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


def norm_url(u):
    return (u or "").strip().split("#")[0].rstrip("/")


def load_raw():
    items = []
    if not RAW.exists():
        return items
    for f in sorted(RAW.glob("*.json")):
        try:
            txt = f.read_text(encoding="utf-8").strip()
        except Exception as e:
            print(f"skip {f.name}: {e}")
            continue
        if not txt.startswith("[") and not txt.startswith("{"):
            m = re.search(r"```(?:json)?\s*(.*?)```", txt, re.S)
            if m:
                txt = m.group(1).strip()
        try:
            data = json.loads(txt)
        except Exception as e:
            print(f"bad json {f.name}: {e}")
            continue
        if isinstance(data, dict):
            for k in ("programs", "camps", "items", "data", "results"):
                if isinstance(data.get(k), list):
                    data = data[k]
                    break
        if not isinstance(data, list):
            print(f"not a list: {f.name}")
            continue
        items += [x for x in data if isinstance(x, dict)]
    return items


def clean(x):
    o = {k: x.get(k) for k in KEEP}
    deg = o.get("degree") or ""
    is_camp = o.get("category") == "camp" or deg in CAMP_DEGREES
    o["category"] = "camp" if is_camp else "program"
    if not deg:
        o["degree"] = "冬令营" if is_camp else "博士"
    tags = o.get("tags")
    o["tags"] = [t for t in (tags if isinstance(tags, list) else []) if isinstance(t, str)]
    if not o.get("url"):
        return None
    for k in ("publishedAt", "deadline", "startDate"):
        o[k] = norm_date(o.get(k))
    if not o.get("school"):
        o["school"] = o.get("schoolShort") or "未知单位"
    if not o.get("schoolShort"):
        o["schoolShort"] = o["school"][:6]
    return o


def main():
    old_first_seen = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
            for e in prev.get("programs", []) + prev.get("camps", []):
                k = norm_url(e.get("url"))
                if k:
                    old_first_seen[k] = e.get("firstSeen") or TODAY
        except Exception:
            pass

    merged = {}
    for it in (clean(x) for x in load_raw()):
        if not it:
            continue
        k = norm_url(it["url"])
        cur = merged.get(k)
        if cur is None or len(json.dumps(it, ensure_ascii=False)) > len(json.dumps(cur, ensure_ascii=False)):
            merged[k] = it

    programs, camps = [], []
    ranked = sorted(merged.items(), key=lambda kv: kv[1].get("publishedAt") or "", reverse=True)
    for i, (k, it) in enumerate(ranked):
        it["id"] = f"{'c' if it['category'] == 'camp' else 'p'}{i + 1:03d}"
        it["firstSeen"] = old_first_seen.get(k) or TODAY
        (camps if it["category"] == "camp" else programs).append(it)

    out = {
        "fetchedAt": TODAY,
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "counts": {
            "programs": len(programs),
            "camps": len(camps),
            "schools": len({it.get("school") for it in programs + camps if it.get("school")}),
        },
        "programs": programs,
        "camps": camps,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"programs={len(programs)} camps={len(camps)} schools={out['counts']['schools']} -> {OUT}")


if __name__ == "__main__":
    main()
