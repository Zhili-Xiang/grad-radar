#!/usr/bin/env python3
"""教育部中外合作办学监管平台（crs.jsj.edu.cn）bio 详情 -> data/raw/intl-moe.json（国际联培板块）

数据源快照：data/external/moe-sino-foreign-joint-programs-bio-details.json
平台无开放许可，本脚本只保留核验所需的编号/有效期/链接等最小字段，条目 URL 指向官方详情页。
名录不含申请截止日期（每年自主招生），deadline 统一记"长期"，名额/学制/批准书有效期进 note。
重复执行安全：整文件覆盖写。
用法：python3 scripts/import_moe.py
"""
import json
import re
import pathlib
import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "external" / "moe-sino-foreign-joint-programs-bio-details.json"
OUT = ROOT / "data" / "raw" / "intl-moe.json"
TODAY = datetime.date.today().isoformat()

COUNTRY_MAP = [
    ("比利时", ("比利时", "欧陆")), ("荷兰", ("荷兰", "欧陆")), ("爱尔兰", ("爱尔兰", "欧陆")),
    ("法国", ("法国", "欧陆")), ("意大利", ("意大利", "欧陆")), ("瑞典", ("瑞典", "欧陆")),
    ("葡萄牙", ("葡萄牙", "欧陆")), ("英国", ("英国", "英国")), ("德国", ("德国", "欧陆")),
    ("俄罗斯", ("俄罗斯", "欧陆")), ("美国", ("美国", "美国")), ("加拿大", ("加拿大", "加拿大")),
    ("澳大利亚", ("澳大利亚", "澳大利亚")), ("日本", ("日本", "日本")), ("韩国", ("韩国", "韩国")),
    ("新加坡", ("新加坡", "东南亚")), ("泰国", ("泰国", "东南亚")), ("马来西亚", ("马来西亚", "东南亚")),
    ("巴西", ("巴西", "拉美")), ("哈萨克", ("哈萨克斯坦", "中亚")),
    ("香港", ("中国香港", "港澳")), ("澳门", ("中国澳门", "港澳")),
]
# 外方强校 → tier 1（清华×JHU 单独 tier 0）
TOP_FOREIGN = ["约翰霍普金斯", "加州大学旧金山", "瓦赫宁根", "香港理工", "斯特拉斯堡",
               "隆德大学", "巴黎大学", "比萨大学", "里斯本大学学院", "巴黎西岱"]


def subfield_of(subject):
    s = subject or ""
    if "药理" in s or "药学" in s:
        return "药学与转化医学"
    if re.search(r"农|兽医|海洋生物|生态", s):
        return "生态与演化"
    if "生物工程" in s or "生物医学工程" in s or "生物制造" in s:
        return "生物医学工程"
    return "生物综合"


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    out = []
    for p in data.get("programs", []):
        name = p.get("name") or ""
        m = re.match(r"^(.+?)与(.+?)合作举办", name)
        if not m:
            continue
        cn, foreign = m.group(1), m.group(2)
        country, region = "其他", "其他"
        for kw, (c, r) in COUNTRY_MAP:
            if kw in foreign:
                country, region = c, r
                break
        tier = 2
        if "约翰霍普金斯" in foreign and "清华" in cn:
            tier = 0
        elif any(t in foreign for t in TOP_FOREIGN):
            tier = 1
        deg = "博士" if "博士" in (p.get("level") or "") else "硕士"
        note_bits = [x for x in [
            f"每期{p.get('quotaPerCohort')}" if p.get("quotaPerCohort") else "",
            f"学制{p.get('duration')}" if p.get("duration") else "",
            p.get("admissionMethod") or "",
            f"批准书有效期至{p.get('validUntil')}" if p.get("validUntil") else "",
        ] if x]
        out.append({
            "title": re.sub(r"教育项目$", "", name).replace("合作举办", "×") ,
            "school": cn,
            "partner": foreign,
            "country": country,
            "region": region,
            "degree": deg,
            "subfield": subfield_of(p.get("subject")),
            "url": p.get("detailUrl") or "",
            "deadline": "长期",
            "funding": "未知",
            "ielts": None,
            "gpa": None,
            "desc": f"教育部批准的合作办学项目：{p.get('subject') or ''}，{p.get('enrollmentYears') or ''}。",
            "schoolDesc": f"教育部中外合作办学监管平台在册（{p.get('approvalNo') or ''}）。",
            "tier": tier,
            "publishedAt": TODAY,
            "note": "；".join(note_bits),
        })
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"moe -> {len(out)} entries")


if __name__ == "__main__":
    main()
