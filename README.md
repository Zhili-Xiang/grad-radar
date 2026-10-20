# 升学雷达

聚合中国顶尖院校 2026–27 招生周期的硕博项目、冬令营、夏令营、暑校信息，附 DeepSeek 智能问答。

覆盖：清北复交、浙大、中科院（含国科大及重点研究所）、中科大、西湖大学、深圳医学科学院（SMART），以及南方科技大学、上海科技大学、港中深、大湾区大学等新势力，重点收录联培专项与小众/新学院（如北大现代农学院）。

## 结构

```
index.html            单页站点（无构建步骤，纯静态）
assets/style.css      样式（Apple 风格）
assets/app.js         渲染 + 筛选 + DeepSeek 问答
data/raw/*.json       各抓取 agent 的原始输出（每路一个文件）
data/programs.json    合并后的站点数据（由脚本生成，勿手改）
scripts/build_data.py 合并脚本：raw -> programs.json（去重、日期规范化、继承 firstSeen）
```

## 数据更新流程

1. 按 `data/raw/` 下现有文件划分的口径（北大、清华、复交、浙大西湖、国科大总体、中科院重点所、中科大南科大、新势力、冬令营专项、暑校专项、联培横搜），派检索 agent 重新抓取当周信息，覆盖写回对应 `data/raw/*.json`。
2. `python3 scripts/build_data.py` 重新合并。
3. `git add -A && git commit -m "data: YYYY-MM-DD 抓取" && git push`，GitHub Pages 自动更新。

条目字段规范见 `scripts/build_data.py` 顶部注释。所有条目必须带官网原文 URL。

## DeepSeek 问答

混合模式：站内条目作为上下文注入，硬事实（截止日期、名额、学费等）只准引用站内数据并标编号；开放性建议要求模型自我标注"一般性建议"。API Key 由访问者自行填入，仅存浏览器 localStorage，直连 DeepSeek 官方接口，不经任何中间服务器。

## 本地预览

```
python3 -m http.server 8765 --directory .
# 打开 http://localhost:8765
```

## 免责

本站只做聚合与导航，不改动原文；报名前一律以各校官网为准。
