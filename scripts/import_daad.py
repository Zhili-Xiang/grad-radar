#!/usr/bin/env python3
"""DAAD International Programmes 库 -> data/raw/overseas-daad.json（海外专区·德国）

数据源：https://www2.daad.de/deutschland/studienangebote/international-programmes/
快照由调研 agent 落在 data/external/daad-international-programmes-bio.json。
只收生物医药/交叉相关 subject；截止日期从富文本中尽力解析，解析不出置空（前端显示"截止未注明"）。
重复执行安全：整文件覆盖写。
用法：python3 scripts/import_daad.py
"""
import json
import re
import pathlib
import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "external" / "daad-international-programmes-bio.json"
OUT = ROOT / "data" / "raw" / "overseas-daad.json"
TODAY = datetime.date.today().isoformat()

SUBJECT_SUBFIELD = {
    "Biochemistry": "分子生物学", "Biology": "生物综合", "Human Biology, Biomedicine": "生物综合",
    "Neuroscience": "神经科学", "Bioengineering": "生物医学工程", "Biotechnology": "生物综合",
    "Bioinformatics": "计算生物学", "Ecology": "生态与演化", "Agriculture": "生态与演化",
    "Food Chemistry": "化学", "Chemistry": "化学", "Pharmacy": "药学与转化医学",
    "Applied Computer Science": "计算机系统", "Computer Science": "计算机系统",
    "Artificial Intelligence": "人工智能", "Data Science": "数据科学",
    "Psychology": "神经科学", "Physics": "物理学", "Mathematics": "数学",
    "Immunology": "免疫学", "Medicine": "生物综合", "Medical Physics": "生物医学工程",
}
BIO_KEEP = re.compile(r"bio|neuro|genom|medic|health|life science|immun|pharma|agric", re.I)

# 德国名校三档（0 世界顶尖 / 1 知名 / 2 其他，Hochschule 类默认 2）
TIER0 = ["Technical University of Munich", "Ludwig-Maximilians-Universität München",
         "Heidelberg University", "Ruprecht-Karls-Universität Heidelberg"]
SCHOOL_ZH = {
    "Technical University of Munich": "慕尼黑工业大学",
    "Ludwig-Maximilians-Universität München": "慕尼黑大学（LMU）",
    "Heidelberg University": "海德堡大学",
    "Ruprecht-Karls-Universität Heidelberg": "海德堡大学",
    "RWTH Aachen University": "亚琛工业大学",
    "Karlsruhe Institute of Technology": "卡尔斯鲁厄理工学院（KIT）",
    "Freie Universität Berlin": "柏林自由大学",
    "Humboldt-Universität zu Berlin": "柏林洪堡大学",
    "Technische Universität Berlin": "柏林工业大学",
    "University of Bonn": "波恩大学",
    "University of Göttingen": "哥廷根大学",
    "University of Tübingen": "图宾根大学",
    "Julius-Maximilians-Universität Würzburg": "维尔茨堡大学",
    "University of Münster": "明斯特大学",
    "Friedrich Schiller University Jena": "耶拿大学",
    "University of Freiburg": "弗莱堡大学",
    "University of Cologne": "科隆大学",
    "Goethe University Frankfurt": "法兰克福大学",
    "University of Hamburg": "汉堡大学",
    "Kiel University": "基尔大学",
    "Philipps-Universität Marburg": "马尔堡大学",
    "Ulm University": "乌尔姆大学",
    "University of Duisburg-Essen": "杜伊斯堡-埃森大学",
    "Saarland University": "萨尔大学",
    "University of Potsdam": "波茨坦大学",
    "University of Konstanz": "康斯坦茨大学",
    "University of Hohenheim": "霍恩海姆大学",
    "Justus Liebig University Giessen": "吉森大学",
    "Heinrich Heine University Düsseldorf": "杜塞尔多夫大学",
    "Johannes Gutenberg University Mainz": "美因茨大学",
    "Bielefeld University": "比勒费尔德大学",
    "Ruhr University Bochum": "波鸿大学",
    "FAU Erlangen-Nürnberg": "埃尔朗根-纽伦堡大学",
    "Hannover Medical School": "汉诺威医学院",
    "Leipzig University": "莱比锡大学",
    "TU Dresden": "德累斯顿工业大学",
    "Technical University of Darmstadt": "达姆施塔特工业大学",
    "University of Stuttgart": "斯图加特大学",
    "TU Braunschweig": "布伦瑞克工业大学",
    "Leibniz University Hannover": "汉诺威莱布尼茨大学",
    "University of Bayreuth": "拜罗伊特大学",
    "University of Regensburg": "雷根斯堡大学",
    "Martin Luther University Halle-Wittenberg": "哈勒-维滕贝格大学",
    "University of Rostock": "罗斯托克大学",
}

MONTHS = {m.lower(): i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], 1)}


def parse_deadline(html):
    s = re.sub(r"<[^>]+>", " ", html or "")
    s = s.replace("&nbsp;", " ").replace("&amp;", "&")
    if "no deadline" in s.lower():
        return "长期"
    m = re.search(r"(\d{1,2})\s+(January|February|March|April|May|June|July|August|"
                  r"September|October|November|December)\s+(\d{4})", s, re.I)
    if m:
        d, mo, y = int(m.group(1)), MONTHS[m.group(2).lower()], int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.search(r"(January|February|March|April|May|June|July|August|September|"
                  r"October|November|December)\s+(\d{1,2}),?\s+(\d{4})", s, re.I)
    if m:
        mo, d, y = MONTHS[m.group(1).lower()], int(m.group(2)), int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.search(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", s)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


CITY_ZH = {
    "Munich": "慕尼黑", "München": "慕尼黑", "Berlin": "柏林", "Heidelberg": "海德堡",
    "Bonn": "波恩", "Cologne": "科隆", "Köln": "科隆", "Frankfurt": "法兰克福",
    "Frankfurt am Main": "法兰克福", "Tübingen": "图宾根", "Münster": "明斯特",
    "Göttingen": "哥廷根", "Würzburg": "维尔茨堡", "Jena": "耶拿", "Freiburg": "弗莱堡",
    "Hamburg": "汉堡", "Kiel": "基尔", "Marburg": "马尔堡", "Ulm": "乌尔姆", "Aachen": "亚琛",
    "Karlsruhe": "卡尔斯鲁厄", "Stuttgart": "斯图加特", "Dresden": "德累斯顿",
    "Darmstadt": "达姆施塔特", "Hannover": "汉诺威", "Braunschweig": "布伦瑞克",
    "Leipzig": "莱比锡", "Halle": "哈勒", "Regensburg": "雷根斯堡", "Bayreuth": "拜罗伊特",
    "Rostock": "罗斯托克", "Konstanz": "康斯坦茨", "Potsdam": "波茨坦",
    "Saarbrücken": "萨尔布吕肯", "Bochum": "波鸿", "Bielefeld": "比勒费尔德",
    "Essen": "埃森", "Duisburg": "杜伊斯堡", "Mainz": "美因茨", "Düsseldorf": "杜塞尔多夫",
    "Erlangen": "埃尔兰根", "Nürnberg": "纽伦堡", "Nuremberg": "纽伦堡", "Giessen": "吉森",
    "Kaiserslautern": "凯泽斯劳滕", "Magdeburg": "马格德堡", "Lübeck": "吕贝克",
    "Freising": "弗赖辛", "Weihenstephan": "魏恩施蒂芬", "Hohenheim": "霍恩海姆（斯图加特）",
}


def school_desc(academy, city):
    zh = SCHOOL_ZH.get(academy)
    city_zh = CITY_ZH.get(city, city)
    if zh:
        return f"{zh}，位于{city_zh}。"
    if re.search(r"Applied Science|Hochschule", academy, re.I):
        return f"德国应用科学大学（{city_zh}），产学研结合紧密。"
    return f"位于{city_zh}的德国高校。"


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    out = []
    for p in data.get("programmes", []):
        subject = (p.get("subject") or "").strip()
        sub = SUBJECT_SUBFIELD.get(subject)
        if not sub:
            blob = f"{subject} {p.get('courseName','')} {p.get('queryKeyword','')}"
            if not BIO_KEEP.search(blob):
                continue
            sub = "生物综合" if BIO_KEEP.search(blob).group(0).lower().startswith(("bio", "neuro", "genom", "medic", "health", "life", "immun", "pharma", "agric")) else "计算机系统"
        academy = p.get("academy") or "德国高校"
        city = p.get("city") or "德国"
        deg = "博士" if p.get("degreeFilter") == "3" else "硕士"
        tier = 0 if academy in TIER0 else (2 if re.search(r"Applied Science|Hochschule", academy, re.I) else 1)
        tuition = p.get("tuitionFees") or ""
        funding = "学费减免" if "no tuition" in tuition.lower() else "未知"
        langs = ", ".join(p.get("languages") or []) or "英语"
        note_bits = [x for x in [
            f"{p.get('programmeDuration') or ''}".strip(),
            f"{p.get('beginning') or ''}入学",
            "结构化博士项目" if p.get("structuredResearch") and deg == "博士" else "",
            f"学费：{tuition}" if tuition and tuition not in ("No tuition fees",) else "",
        ] if x]
        out.append({
            "title": p.get("courseName") or "未命名项目",
            "school": academy,
            "country": "德国",
            "region": "欧陆",
            "degree": deg,
            "subfield": sub,
            "url": "https://www2.daad.de" + (p.get("link") or ""),
            "deadline": parse_deadline(p.get("applicationDeadline")),
            "funding": funding,
            "ielts": None,
            "gpa": None,
            "desc": f"{subject or '生命/交叉学科'}·{langs}授课·{p.get('beginning') or '冬季学期'}入学",
            "schoolDesc": school_desc(academy, city),
            "tier": tier,
            "publishedAt": TODAY,
            "note": "；".join(note_bits[:3]),
        })
    # 去重（同名同校只留一条信息更全的）
    seen = {}
    for e in out:
        k = (e["school"], e["title"])
        if k not in seen or len(e["note"]) > len(seen[k]["note"]):
            seen[k] = e
    final = sorted(seen.values(), key=lambda e: (e["tier"], e["school"]))
    OUT.write_text(json.dumps(final, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"daad -> {len(final)} entries ({sum(1 for e in final if e['degree']=='博士')} PhD)")


if __name__ == "__main__":
    main()
