# data/external — 外部开源/官方数据源落地数据

调研日期：2026-10-23。所有数据均来自官方（.gov.cn / 德国 DAAD）公开接口，非中介营销页。
本目录只存"可直接引用的结构化数据"；抓取脚本与临时文件不在此目录。

## 1. daad-international-programmes-bio.json

- 来源：DAAD（德意志学术交流中心）International Programmes in Germany 数据库
- 接口：`https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json`（无 key、公开、Solr JSON）
- 站点：https://www2.daad.de/deutschland/studienangebote/international-programmes/en/
- 取数条件：`degree[]=3`（PhD/Doctorate）与 `degree[]=2`（Master's），关键词 biology / life sciences / biomedical / bioinformatics / biotechnology / neuroscience / molecular biology 等生物与交叉方向
- 规模：379 条（博士 120 + 硕士 259），按 `id` 去重
- 覆盖：德国全境、英语/德语授课国际项目；学科以生命科学/生物医学/交叉为主
- 字段：courseName（项目名）、academy（大学）、city、subject、languages、languageLevelGerman/English、applicationDeadline（HTML 富文本，需清洗）、date[].registrationDeadline、programmeDuration、tuitionFees、date[].costs、financialSupport、beginning、link（DAAD 详情页相对路径，拼 `https://www2.daad.de` + link）
- 许可：接口公开无鉴权，但 DAAD 未声明开放数据许可；数据库内容版权归 DAAD。建议站内展示时逐条附 DAAD 详情页链接作为出处，不作批量原文转载
- 更新频率：接口实时反映数据库（官方维护，滚动更新，申请截止日期随学年刷新）
- 接入建议：写一个 fetch 脚本按上述关键词轮询 `degree[]=3/2`，映射到站内 raw 格式：`title=courseName`、`school=academy`、`deadline=applicationDeadline 清洗后`、`location=city`、`requirements←languages + languageLevel`、`url=https://www2.daad.de{link}`、`funding←financialSupport/tuitionFees`。富文本字段先 `BeautifulSoup` 去标签

## 2. moe-sino-foreign-joint-programs-index.json

- 来源：教育部中外合作办学监管工作信息平台（jsji.moe.gov.cn 的可访问域名为 www.crs.jsj.edu.cn）
- 页面：`/aproval/getbyarea/{1..31}`（31 个省级页，含反爬中转 `/GE/CC/VALIDATOR`，curl 带 cookie jar 可过）
- 内容：全国经教育部审批/复核的**硕士及以上**中外合作办学项目与机构全量名录，253 条；每条含项目名（内嵌中方校、外方校、专业、层次）、省份、`detailUrl`（官方详情页）
- 许可：站点页脚声明"未经允许不得复制、镜像"，**无开放许可**。本文件仅作站内索引进一步核验用，公开展示时逐条链接官方 detailUrl，不整表转载
- 更新频率：官方名录随审批/复核动态更新（详情页含 2025 年的变更记录，说明活跃维护）
- 接入建议：项目名可用正则 `^(.+?)与(.+?)(合作举办)?(.+?)(硕士|博士)` 拆出中方校/外方校/专业/层次；作为"中外合作办学硕博名录"板块的权威底表，链接到 detailUrl

## 3. moe-sino-foreign-joint-programs-bio-details.json

- 来源：同上，`/aproval/detail/{id}` 详情页，已解析为结构化字段
- 内容：27 条生物医学/健康/农学生命科学方向（关键词：生物/医学/药学/生命/护理/兽医/公卫/生态等）
- 字段：title（项目名）、partners（中外合作办学者）、level（办学层次，如"博士研究生教育"）、duration（学制）、quotaPerCohort（**每期招生人数**）、enrollmentYears（招生起止年份）、admissionMethod（招生方式，统考/自主招生）、subject（开设专业，含专业代码 H 尾缀）、certificates（颁发证书）、authority（审批机关）、approvalNo（批准书编号）、validUntil（批准书有效期）、address、province/provinceName、detailUrl
- 许可与更新：同上（官方名录，无开放许可，逐条引用 + 链接）
- 接入建议：直接映射 raw 格式：`title`、`institute=partners`、`location=address`、`requirements=[level, quotaPerCohort, admissionMethod, enrollmentYears]`、`url=detailUrl`；`deadline` 官方名录不给（给出的是招生年份区间），不要臆造

## 未落地但已验证的源（详见调研报告）

- Erasmus+ 项目结果平台：`https://erasmus-plus.ec.europa.eu/projects/projects-lists` 每日刷新的全量项目 CSV/XLS（KA1/KA2/JeanMonnet/Sports；含欧盟资助金额、参与国、协调机构），但 2025 KA1 文件中不含 Erasmus Mundus Joint Masters 行
- jobs.ac.uk（英国高校官方招聘平台）：`/search/phd` 服务端渲染 HTML，可抓英国 PhD studentship（含 funding 描述），无公开 API/RSS
- EURAXESS（欧盟委员会）：`/jobs/search` 服务端渲染 HTML 可抓；公开 REST API 未找到（旧 `/apis/*` 已 404）
- FindAPhD：RSS 存在于 `https://www.findaphd.com/phds/rss.aspx`，但 Cloudflare 拦截非浏览器 UA，需浏览器自动化；注意其 ToS 与商业数据授权
- 留学基金委 csc.edu.cn：本机网络被 WAF 拦截（curl 412、远端阅读服务 500），需国内网络环境再验证
