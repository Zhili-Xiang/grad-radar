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
        "snippet", "source", "dateEstimated", "requirements"]
CAMP_DEGREES = {"夏令营", "冬令营", "暑校", "学习班"}

# 大类分类：1) 精确覆盖表（多领域专项、机构定向）2) 标题+学院关键词（强信号）
# 3) 兜底：整校章程/简章归其他交叉 4) 正文关键词（弱信号）
TI_SPECIFIC = [
    ("医学部", "生物医学"),
    ("杭州医学研究所—天津大学", "化学材料"),
    ("未来技术学院2027年工程硕博士", "生物医学"),
    ("数据科学学院", "计科软工"),
    ("理工学院（SSE）", "计科软工"),
    ("海洋学院", "其他交叉"),
    ("统考名额", "其他交叉"),
    ("工程硕博士", "其他交叉"),
    ("卓越工程师", "其他交叉"),
    ("联培基地", "其他交叉"),
    ("钱塘", "其他交叉"),
    ("IDEA", "计科软工"),
    ("科学史", "其他交叉"),
    ("计算社会科学", "其他交叉"),
]
TI_GENERIC = [
    ("招生章程", "其他交叉"),
    ("博士研究生招生简章", "其他交叉"),
    ("硕士研究生招生简章", "其他交叉"),
    ("校本部", "其他交叉"),
    ("各学院学科招生简章", "其他交叉"),
    ("普博生第一批报名通知", "其他交叉"),
]
FIELD_RULES = [
    ("生物医学", ["生命", "医学", "医药", "药", "农", "脑", "神经", "类脑", "NIBS",
                 "TIMBR", "CLS", "PTN", "生物", "护理", "健康", "植物"]),
    ("化学材料", ["化学", "材料", "材料科学", "材料与化工", "新材料", "先进材料", "材料学院",
                 "应化", "催化", "高分子", "纳米", "化物", "有机所", "过程工程"]),
    ("数学物理", ["数学", "物理", "天文", "量子", "高能", "核科学", "核工程", "核技术",
                 "光学", "力学", "数学院", "应物所", "精密测量", "概率论", "数理统计"]),
    ("其他交叉", ["机械", "制造", "土木", "水利", "环境", "海洋", "地球", "地学", "能源",
                 "动力", "交通", "航空", "法律", "经济", "金融", "管理", "教育", "社科",
                 "历史", "碳中和"]),
    ("电子信息", ["电子", "集成电路", "微电子", "通信", "信通", "光电", "半导体", "电磁",
                 "控制", "自动化", "机器人", "电气", "仪器", "微波"]),
    ("计科软工", ["计算机", "软件", "人工智能", "智能", "机器学习", "大数据", "数据科学",
                 "密码", "网络", "算法", "计算"]),
]


def classify_fields(e):
    """多标签分类：跨学科联培（如大湾区-南科大覆盖数理化计电）同时挂多个大类。
    TI_SPECIFIC 命中视为唯一归属；否则标题/学院层全量匹配，空则整校章程兜底，
    再叠加正文层匹配（排除"其他交叉"关键词，避免"智能制造"式列举污染），最多 4 个。"""
    ti = (e.get("title") or "") + (e.get("institute") or "")
    for pat, field in TI_SPECIFIC:
        if pat in ti:
            return [field]
    weak = " ".join(str(e.get(k) or "") for k in ("highlights", "snippet", "school"))
    weak += " " + " ".join(t for t in (e.get("tags") or []) if isinstance(t, str))
    # 消歧："申请材料/书面材料"等无学科含义；"材料"后接时间/动作词也为报名材料；
    # "生物化学"属生物大类而非化学；"教育部"不指教育学
    def deambig(s):
        s = re.sub(r"(申请|报名|提交|审核|公示|评审|名单|书面|纸质|支撑|证明|随附|相关|报考|需要|所需)材料", "", s)
        # 裸"材料"后接时间/动作词视为报名材料；顿号/逗号前导（学科枚举）或"新/进"前导（新材料/先进材料）保留
        s = re.sub(r"(?<![、,新进])材料(?=[，。；、:：)）0-9０-９]|PDF|pdf|于|按|须|发送|整合|合并|上传|邮件|寄|前|截止)", "", s)
        s = re.sub(r"生物化学", "生物", s)
        s = re.sub(r"教育部", "", s)
        return s
    ti_c, weak_c = deambig(ti), deambig(weak)
    fields = [field for field, kws in FIELD_RULES if any(k in ti_c for k in kws)]
    if not fields:
        for pat, field in TI_GENERIC:
            if pat in ti:
                return [field]
    for field, kws in FIELD_RULES:
        if field == "其他交叉" or field in fields:
            continue
        if any(k in weak_c for k in kws):
            fields.append(field)
    return fields[:4] or ["其他交叉"]


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
    reqs = o.get("requirements")
    o["requirements"] = [r for r in (reqs if isinstance(reqs, list) else []) if isinstance(r, str)]
    if not o.get("url"):
        return None
    for k in ("publishedAt", "deadline", "startDate"):
        o[k] = norm_date(o.get(k))
    if not o.get("school"):
        o["school"] = o.get("schoolShort") or "未知单位"
    if not o.get("schoolShort"):
        o["schoolShort"] = o["school"][:6]
    o["fields"] = classify_fields(o)
    o["field"] = o["fields"][0]
    o["hub"] = derive_hub(o)
    pub = o.get("publishedAt") or ""
    o["lastCycle"] = bool(pub and pub < "2026-01-01"
                          and "长期开放" not in o["tags"] and "长期" not in " ".join(o["tags"]))
    return o


def load_requirements():
    """sidecar：data/requirements.json，键为规范化 URL。weekly 覆盖 raw 也不会丢人工核实条件。"""
    path = ROOT / "data" / "requirements.json"
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return {norm_url(k): v for k, v in raw.items()
                if not k.startswith("_") and isinstance(v, list)}
    except Exception as e:
        print(f"requirements.json 解析失败: {e}")
        return {}


def load_display():
    """sidecar：data/display/*.json，元素 {url, title, highlights, srcTitle?}。
    同一 URL 可挂多个条目（如总简章页拆出的联培方向），用 srcTitle 与原题匹配消歧。"""
    out = {}
    ddir = ROOT / "data" / "display"
    if not ddir.exists():
        return out
    for f in sorted(ddir.glob("*.json")):
        try:
            arr = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"display/{f.name} 解析失败: {e}")
            continue
        if isinstance(arr, list):
            for x in arr:
                if isinstance(x, dict) and x.get("url"):
                    out.setdefault(norm_url(x["url"]), []).append(x)
    return out


def pick_display(cands, src_title):
    if not cands:
        return None
    for x in cands:
        st = x.get("srcTitle")
        if st and src_title and st in src_title:
            return x
    plain = [x for x in cands if not x.get("srcTitle")]
    return (plain or cands)[-1]


# 联培枢纽：条目文本命中关键词即归入该枢纽（联培专区按枢纽聚合展示）
HUB_KEYWORDS = [
    ("深圳理工大学", ["深圳理工", "深理工", "suat"]),
    ("深圳医学科学院", ["深圳医科院", "SMART", "深圳湾实验室", "smart.org"]),
    ("广州实验室", ["广州实验室", "广州国家实验室"]),
    ("鹏城实验室", ["鹏城"]),
    ("张江实验室", ["张江实验室"]),
    ("临港实验室", ["临港实验室"]),
    ("苏州实验室", ["苏州国家实验室", "苏州实验室"]),
    ("崂山实验室", ["崂山"]),
    ("昌平实验室", ["昌平实验室"]),
    ("乾元实验室", ["乾元"]),
    ("钱塘实验室", ["钱塘"]),
    ("瓯江实验室", ["瓯江"]),
    ("崖州湾实验室", ["崖州湾"]),
    ("大湾区大学", ["大湾区大学"]),
    ("上海AI实验室", ["上海人工智能实验室", "shlab"]),
    ("NIBS/北生所", ["NIBS", "北生所", "北生所", "TIMBR"]),
    ("CLS/PTN项目", ["CLS", "PTN", "生命科学联合中心"]),
    ("IDEA研究院", ["IDEA"]),
    ("东方理工", ["东方理工"]),
    ("科学岛", ["科学岛", "合肥物质"]),
]


def derive_hub(o):
    text = " ".join(str(o.get(k) or "") for k in ("title", "institute", "school", "schoolShort", "url"))
    text += " " + " ".join(t for t in (o.get("tags") or []) if isinstance(t, str))
    for hub, kws in HUB_KEYWORDS:
        if any(k.lower() in text.lower() for k in kws):
            return hub
    if o.get("degree") == "联培" or "联培" in (o.get("tags") or []):
        return o.get("schoolShort") or o.get("school") or "其他联培"
    return None


def main():
    old_first_seen = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
            for e in prev.get("programs", []) + prev.get("camps", []):
                k = (norm_url(e.get("url")), e.get("title"))
                if k[0]:
                    old_first_seen[k] = e.get("firstSeen") or TODAY
        except Exception:
            pass

    # 先应用展示层覆盖（title/highlights），再去重——避免同 URL 不同原题的条目
    # 被改成同一展示标题后仍以两条存在（视觉重复）
    display = load_display()
    merged = {}
    for it in (clean(x) for x in load_raw()):
        if not it:
            continue
        disp = pick_display(display.get(norm_url(it["url"])), it.get("title"))
        if disp:
            if disp.get("title"):
                it["srcTitle"] = it["title"]
                it["title"] = disp["title"]
            if disp.get("highlights"):
                it["highlights"] = disp["highlights"]
        k = (norm_url(it["url"]), it.get("title"))
        cur = merged.get(k)
        if cur is None or len(json.dumps(it, ensure_ascii=False)) > len(json.dumps(cur, ensure_ascii=False)):
            merged[k] = it

    programs, camps = [], []
    sidecar = load_requirements()
    ranked = sorted(merged.items(), key=lambda kv: kv[1].get("publishedAt") or "", reverse=True)
    for i, (k, it) in enumerate(ranked):
        it["id"] = f"{'c' if it['category'] == 'camp' else 'p'}{i + 1:03d}"
        it["firstSeen"] = old_first_seen.get(k) or TODAY
        url_key = norm_url(it.get("url"))
        if url_key in sidecar and sidecar[url_key]:
            merged_reqs = sidecar[url_key]
            existing = it.get("requirements") or []
            seen = {r for r in existing}
            for r in merged_reqs:
                if r not in seen:
                    existing.append(r)
            it["requirements"] = existing
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
