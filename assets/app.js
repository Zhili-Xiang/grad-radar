'use strict';

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysUntil = d => {
  if (!d) return null;
  const t = new Date(d + 'T23:59:59').getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 864e5);
};
const fmtMD = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '';

let DATA = null;
const state = {
  school: '全部', degree: '全部', field: '全部', q: '', sort: 'urgency', hideExpired: true,
  camp: '全部', campField: '全部',
};

/* ---------- 数据加载 ---------- */
async function boot() {
  try {
    const res = await fetch('data/programs.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) {
    $('#nav-updated').textContent = '数据尚未生成';
    ['program-grid', 'camp-grid'].forEach(id => {
      $('#' + id).innerHTML = `<p class="empty">数据文件还没就绪（可能正在首次抓取），稍后刷新重试。</p>`;
    });
    return;
  }
  const all = [...(DATA.programs || []), ...(DATA.camps || [])];
  const d = (DATA.fetchedAt || '').slice(5).replace('-', '·');
  $('#nav-updated').textContent = d ? `数据更新于 ${d}` : '';
  $('#foot-date').textContent = DATA.fetchedAt || '—';

  buildFilters(all);
  renderPrograms();
  renderCamps();
  renderJoint();
  renderStats(all);
  renderDigest(all);
  observeReveals();
}

/* ---------- 筛选 ---------- */
function chipRow(el, items, active, onPick) {
  el.innerHTML = items.map(t =>
    `<button class="chip${t === active ? ' on' : ''}" data-v="${esc(t)}">${esc(t)}</button>`).join('');
  el.onclick = e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    onPick(b.dataset.v);
  };
}

function buildFilters(all) {
  // 院校下拉只列“招生项目”区可见条目（未过期）出现过的院校，
  // 避免只有夏令营/已截止条目的单位点了显示为空
  const schoolCount = new Map();
  (DATA.programs || []).forEach(e => {
    const d = daysUntil(e.deadline);
    if (d !== null && d < 0) return;
    const k = e.schoolShort || e.school || '其他';
    schoolCount.set(k, (schoolCount.get(k) || 0) + 1);
  });
  const schools = [...schoolCount.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const schoolSel = $('#school-select');
  schoolSel.innerHTML = `<option value="全部">全部院校（${schools.length}）</option>` +
    schools.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  schoolSel.onchange = () => { state.school = schoolSel.value; renderPrograms(); };

  $('#degree-select').onchange = e => { state.degree = e.target.value; renderPrograms(); };

  const fields = ['全部', '数学物理', '生物医学', '化学材料', '计科软工', '电子信息', '其他交叉'];
  chipRow($('#field-chips'), fields, state.field, v => {
    state.field = v;
    $$('#field-chips .chip').forEach(c => c.classList.toggle('on', c.dataset.v === state.field));
    renderPrograms();
  });

  const campTypes = ['全部', '冬令营', '夏令营', '暑校', '学习班'];
  chipRow($('#camp-chips'), campTypes, state.camp, v => {
    state.camp = v; renderCamps();
  });
  $('#camp-field-select').onchange = e => { state.campField = e.target.value; renderCamps(); };
}

/* ---------- 卡片 ---------- */
function deadlineChip(e) {
  const days = daysUntil(e.deadline);
  if (days === null) return `<span class="chip-dl dl-none">截止未注明</span>`;
  if (days < 0) return `<span class="chip-dl dl-none">已截止</span>`;
  if (days === 0) return `<span class="chip-dl dl-urgent">今天截止</span>`;
  if (days <= 7) return `<span class="chip-dl dl-urgent">剩 ${days} 天</span>`;
  if (days <= 30) return `<span class="chip-dl dl-soon">${days} 天后截止</span>`;
  return `<span class="chip-dl dl-far">${fmtMD(e.deadline)} 截止</span>`;
}

function cardHTML(e, i) {
  const days = daysUntil(e.deadline);
  const expired = days !== null && days < 0;
  const isNew = e.firstSeen && daysUntil(e.firstSeen) >= -1 && daysUntil(e.firstSeen) <= 7;
  const isPast = (e.tags || []).includes('往期参考');
  const degree = e.degree || '';
  const tags = (e.tags || []).filter(t => t !== '往期参考').slice(0, 3);
  const pastBadge = e.lastCycle
    ? '<span class="badge-past">去年通知 · 今年未发</span>'
    : (isPast ? '<span class="badge-past">往期参考</span>' : '');
  return `
<article class="card reveal${expired ? ' expired' : ''}" style="transition-delay:${Math.min((i % 9) * 45, 360)}ms">
  <div class="card-top">
    <span class="chip-school">${esc(e.schoolShort || e.school || '')}</span>
    ${(e.fields || [e.field]).filter(Boolean).slice(0, 2).map(f => `<span class="chip-field f-${esc(f)}">${esc(f)}</span>`).join('')}
    ${(e.fields || []).length > 2 ? `<span class="chip-field f-其他交叉">+${(e.fields || []).length - 2}</span>` : ''}
    ${degree ? `<span class="chip-degree d-${esc(degree)}">${esc(degree)}</span>` : ''}
    ${isNew ? '<span class="badge-new">新</span>' : ''}
    ${pastBadge}
  </div>
  <h3 class="card-title">${esc(e.title)}</h3>
  ${e.institute ? `<p class="card-inst">${esc(e.institute)}</p>` : ''}
  <p class="card-hl">${esc(e.highlights || e.snippet || '')}</p>
  ${(e.requirements || []).length ? `<p class="card-req"><span class="req-label">报名条件</span>${esc(e.requirements.join('；'))}</p>` : ''}
  ${tags.length ? `<div class="card-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="card-foot">
    ${deadlineChip(e)}
    <span class="card-date">${esc(e.publishedAt || '')}${e.dateEstimated ? '*' : ''}</span>
    <a href="${esc(e.url)}" target="_blank" rel="noopener">原文 ↗</a>
  </div>
</article>`;
}

function matchField(e, f) {
  if (f === '全部') return true;
  if (Array.isArray(e.fields)) return e.fields.includes(f);
  return e.field === f;
}

function searchable(e) {
  return [e.school, e.schoolShort, e.institute, e.title, e.highlights, e.snippet, e.degree, (e.fields || [e.field]).join(' '), (e.tags || []).join(' ')].join(' ').toLowerCase();
}

function renderPrograms() {
  if (!DATA) return;
  let list = (DATA.programs || []).filter(e =>
    (state.school === '全部' || e.schoolShort === state.school || e.school === state.school) &&
    (state.degree === '全部' || e.degree === state.degree || (e.tags || []).includes(state.degree)) &&
    matchField(e, state.field));
  if (state.q) list = list.filter(e => searchable(e).includes(state.q.toLowerCase()));
  if (state.hideExpired) list = list.filter(e => { const d = daysUntil(e.deadline); return d === null || d >= 0; });
  if (state.sort === 'urgency') {
    list.sort((a, b) => {
      const da = daysUntil(a.deadline), db = daysUntil(b.deadline);
      if (da === null && db === null) return (b.publishedAt || '').localeCompare(a.publishedAt || '');
      if (da === null) return 1;
      if (db === null) return -1;
      if (da !== db) return da - db;
      return (b.publishedAt || '').localeCompare(a.publishedAt || '');
    });
  } else {
    list.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  }
  $('#program-grid').innerHTML = list.map(cardHTML).join('');
  $('#program-empty').hidden = list.length > 0;
  observeReveals();
}

function renderCamps() {
  if (!DATA) return;
  let list = (DATA.camps || []).filter(e =>
    (state.camp === '全部' || e.degree === state.camp) &&
    matchField(e, state.campField));
  list.sort((a, b) => {
    const ka = daysUntil(a.startDate) ?? daysUntil(a.deadline);
    const kb = daysUntil(b.startDate) ?? daysUntil(b.deadline);
    const va = ka === null ? 1e9 : (ka < 0 ? 1e9 + ka : ka);
    const vb = kb === null ? 1e9 : (kb < 0 ? 1e9 + kb : kb);
    return va - vb;
  });
  $('#camp-grid').innerHTML = list.map(cardHTML).join('');
  $('#camp-empty').hidden = list.length > 0;
  observeReveals();
}

/* ---------- 联培专区 ---------- */
const HUB_TEST = {
  '深圳理工大学': /深理工|深圳理工/, '深圳医学科学院': /SMART|深圳医科|深圳湾/, '广州实验室': /广州(国家)?实验室/,
  '鹏城实验室': /鹏城/, '张江实验室': /张江/, '临港实验室': /临港/, '苏州实验室': /苏州(国家)?实验室/,
  '崂山实验室': /崂山/, '昌平实验室': /昌平/, '乾元实验室': /乾元/, '钱塘实验室': /钱塘/, '瓯江实验室': /瓯江/,
  '崖州湾实验室': /崖州湾/, '大湾区大学': /大湾区/, '上海AI实验室': /上海人工智能|shlab/, 'NIBS/北生所': /NIBS|北生所|TIMBR/,
  'CLS/PTN项目': /CLS|PTN|生命科学联合中心/, 'IDEA研究院': /IDEA/, '东方理工': /东方理工/, '科学岛': /科学岛|合肥物质/,
};
function hubOf(e) { return e.hub || null; }
function partnerOf(e, hub) {
  const re = HUB_TEST[hub];
  const cands = [e.schoolShort, e.school].filter(Boolean);
  for (const c of cands) if (!re || !re.test(c)) return c;
  const m = (e.title || '').split(/[-—－]/).map(s => s.trim()).filter(s => s && (!re || !re.test(s)));
  return m[0] || '';
}
function renderJoint() {
  if (!DATA) return;
  const all = [...(DATA.programs || []), ...(DATA.camps || [])].filter(e => e.hub);
  const groups = new Map();
  all.forEach(e => {
    if (!groups.has(e.hub)) groups.set(e.hub, []);
    groups.get(e.hub).push(e);
  });
  const hubs = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  $('#joint-grid').innerHTML = hubs.map(([hub, list]) => {
    const partners = [...new Set(list.map(e => partnerOf(e, hub)).filter(Boolean))];
    const shown = partners.slice(0, 5);
    const more = partners.length - shown.length;
    return `
<button class="hub-card" data-hub="${esc(hub)}">
  <div class="hub-top"><span class="hub-name">${esc(hub)}</span><span class="hub-badge">${list.length} 个项目</span></div>
  <span class="hub-count">合作高校/机构 ${partners.length} 家</span>
  <div class="hub-partners">${shown.map(p => `<span>${esc(p)}</span>`).join('')}${more > 0 ? `<span class="more">等 ${partners.length} 家</span>` : ''}</div>
</button>`;
  }).join('');
  $('#joint-grid').onclick = e => {
    const b = e.target.closest('.hub-card');
    if (!b) return;
    openHub(b.dataset.hub);
  };
}
function openHub(hub) {
  const all = [...(DATA.programs || []), ...(DATA.camps || [])].filter(e => e.hub === hub);
  const partners = [...new Set(all.map(e => partnerOf(e, hub)).filter(Boolean))];
  $('#joint-grid').hidden = true;
  const detail = $('#joint-detail');
  detail.hidden = false;
  $('#joint-hub-name').textContent = hub;
  $('#joint-hub-sub').textContent = `与 ${partners.length} 家高校/机构联合培养 · ${all.length} 个项目（含往期参考）`;
  all.sort((a, b) => {
    const da = daysUntil(a.deadline), db = daysUntil(b.deadline);
    const va = da === null ? 1e9 : (da < 0 ? 1e9 + da : da);
    const vb = db === null ? 1e9 : (db < 0 ? 1e9 + db : db);
    return va - vb;
  });
  $('#joint-cards').innerHTML = all.map((e, i) => cardHTML(e, i)).join('');
  observeReveals();
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#joint-back').addEventListener('click', () => {
  $('#joint-detail').hidden = true;
  $('#joint-grid').hidden = false;
  $('#joint-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- hero 摘要卡 ---------- */
function renderDigest(all) {
  const box = $('#hero-digest');
  if (!box) return;
  const soon = all
    .filter(e => { const d = daysUntil(e.deadline); return d !== null && d >= 0 && d <= 30; })
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))
    .slice(0, 3);
  const row = e => {
    const d = daysUntil(e.deadline);
    const cls = d <= 7 ? 'urgent' : 'soon';
    const label = d === 0 ? '今天' : `剩 ${d} 天`;
    const school = e.schoolShort || e.school || '';
    const name = e.title.includes(school) ? e.title : school + e.title;
    return `
<a class="hd-row" href="#programs">
  <span class="hd-days ${cls}">${label}</span>
  <span class="hd-name">${esc(name)}</span>
  <span class="hd-date">${fmtMD(e.deadline)} 截止</span>
</a>`;
  };
  box.innerHTML = soon.length
    ? `<div class="hd-title"><span>30 天内截止</span><a href="#programs">查看全部 →</a></div>${soon.map(row).join('')}`
    : `<div class="hd-title"><span>30 天内暂无截止条目</span></div>`;
}

/* ---------- 统计 ---------- */
function countUp(el, n) {
  el.textContent = n;
  if (n <= 0 || document.hidden) return;
  const t0 = performance.now(), dur = 900;
  const tick = t => {
    const p = Math.min((t - t0) / dur, 1);
    el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function renderStats(all) {
  countUp($('#stat-total'), all.length);
  countUp($('#stat-schools'), new Set(all.map(e => e.school).filter(Boolean)).size);
  countUp($('#stat-urgent'), all.filter(e => { const d = daysUntil(e.deadline); return d !== null && d >= 0 && d <= 7; }).length);
  countUp($('#stat-new'), all.filter(e => { const d = daysUntil(e.firstSeen || e.publishedAt); return d !== null && d >= 0 && d <= 7; }).length);
}

/* ---------- 交互绑定 ---------- */
$('#search').addEventListener('input', e => { state.q = e.target.value.trim(); renderPrograms(); });
$('#sort').addEventListener('change', e => { state.sort = e.target.value; renderPrograms(); });
$('#hide-expired').addEventListener('change', e => { state.hideExpired = e.target.checked; renderPrograms(); });
addEventListener('scroll', () => {
  $('#nav').classList.toggle('scrolled', scrollY > 8);
}, { passive: true });

let io = null;
function observeReveals() {
  if (!('IntersectionObserver' in window)) { $$('.reveal').forEach(el => el.classList.add('in')); return; }
  if (!io) io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: .08 });
  $$('.reveal:not(.in)').forEach(el => io.observe(el));
}

/* ---------- DeepSeek 问答（混合模式） ---------- */
const DS_URL = 'https://api.deepseek.com/chat/completions';
const KEY_NAME = 'gradar_ds_key';
const getKey = () => localStorage.getItem(KEY_NAME) || '';
const history = [];

const ALIAS = {
  '清华': '清华大学', '北大': '北京大学', '复旦': '复旦大学', '上交': '上海交通大学', '交大': '上海交通大学',
  '浙大': '浙江大学', '西湖': '西湖大学', '中科大': '中国科学技术大学', '科大': '中国科学技术大学',
  '国科大': '中国科学院大学', '中科院': '中国科学院', '南科大': '南方科技大学', '上科大': '上海科技大学',
  '港中深': '香港中文大学（深圳）', 'smart': '深圳医学科学院', '深医科院': '深圳医学科学院',
};

function buildContext(question) {
  const all = [...(DATA.programs || []), ...(DATA.camps || [])];
  if (!all.length) return [];
  const q = question.toLowerCase();
  const tokens = [question, ...question.split(/[\s，,。？?！!、；;]+/).filter(w => w.length >= 2)];
  for (const [k, v] of Object.entries(ALIAS)) if (q.includes(k)) tokens.push(v);
  const scored = all.map(e => {
    const s = searchable(e);
    let sc = 0;
    for (const t of tokens) if (t && s.includes(t.toLowerCase())) sc += t.length >= 3 ? 3 : 2;
    const d = daysUntil(e.deadline);
    if (d !== null && d >= 0 && d <= 30) sc += 2;
    return { e, sc };
  });
  scored.sort((a, b) => b.sc - a.sc);
  let picked = scored.filter(x => x.sc > 0).slice(0, 24).map(x => x.e);
  if (picked.length < 12) {
    const rest = scored.filter(x => !picked.includes(x.e))
      .sort((a, b) => {
        const da = daysUntil(a.e.deadline), db = daysUntil(b.e.deadline);
        const va = da === null ? 999 : (da < 0 ? 999 : da);
        const vb = db === null ? 999 : (db < 0 ? 999 : db);
        return va - vb;
      }).slice(0, 16 - picked.length).map(x => x.e);
    picked = picked.concat(rest);
  }
  return picked.slice(0, 26);
}

function systemPrompt(ctx) {
  const lines = ctx.map((e, i) =>
    `[${i + 1}] ${e.school || ''}${e.institute ? '·' + e.institute : ''}｜${e.title}｜${e.degree || ''}｜${(e.fields || [e.field]).join('/')}｜${e.deadline ? '截止' + e.deadline : '截止未注明'}${e.lastCycle ? '｜注意:此为去年版通知,今年新版未发布' : ''}${(e.requirements || []).length ? '｜报名条件:' + e.requirements.join('；') : ''}｜${e.url}`);
  return `你是"升学雷达"网站的招生咨询助手。今天是 ${todayISO()}。
【站内数据库】以下是本周抓取的招生/冬夏令营条目（编号、截止日期、原文链接）：
${lines.join('\n')}

回答规则：
1. 涉及截止日期、招生名额、学制学费、报名条件等硬事实，只能依据上面的站内条目回答，并在对应信息后标注编号（如 [3]）。站内没有相关条目时，直说"站内未收录这一条，请到官网核实"，禁止凭训练记忆给出任何具体日期或数字。
2. 择校策略、时间线规划、背景提升等开放问题可以自由回答，但开头注明"以下是一般性建议"。
3. 用中文回答，条理清晰，多用短列表；引用了条目时结尾提醒"以官网原文为准"。`;
}

function mdLite(raw) {
  let h = esc(raw);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\[(\d{1,3})\]/g, '<span class="ref">[$1]</span>');
  return h;
}

function addMsg(cls, html) {
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.innerHTML = html;
  $('#chat-messages').appendChild(div);
  $('#chat-messages').scrollTop = 1e9;
  return div;
}

function renderRefs(bubble, answer, ctx) {
  const nums = [...new Set([...answer.matchAll(/\[(\d{1,3})\]/g)].map(m => +m[1]))]
    .filter(n => n >= 1 && n <= ctx.length).slice(0, 6);
  if (!nums.length) return;
  const row = document.createElement('div');
  row.className = 'src-row';
  row.innerHTML = nums.map(n => {
    const e = ctx[n - 1];
    return `<a href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.title)}">${esc((e.schoolShort || e.school) + (e.institute ? '·' + e.institute : ''))} ↗</a>`;
  }).join('');
  bubble.appendChild(row);
}

async function streamAnswer(messages, bubble) {
  const res = await fetch(DS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getKey() },
    body: JSON.stringify({ model: 'deepseek-chat', messages, stream: true, temperature: 0.4, max_tokens: 1600 }),
  });
  if (!res.ok) {
    let hint = `请求失败（${res.status}）`;
    if (res.status === 401) hint = 'Key 无效或已过期，请检查后重新保存。';
    if (res.status === 402) hint = 'DeepSeek 账户余额不足。';
    if (res.status === 429) hint = '请求太频繁，稍等几秒再试。';
    throw new Error(hint);
  }
  if (!res.body || !res.body.getReader) {
    const j = await res.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '(空回复)';
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', acc = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (d) { acc += d; bubble.innerHTML = mdLite(acc); $('#chat-messages').scrollTop = 1e9; }
      } catch (_) { /* 半包，忽略 */ }
    }
  }
  return acc || '(空回复)';
}

async function send(question) {
  if (!getKey()) { $('#key-panel').hidden = false; $('#key-input').focus(); return; }
  addMsg('msg-user', esc(question));
  history.push({ role: 'user', content: question });
  const bubble = addMsg('msg-ai', '思考中…');
  $('#chat-send').disabled = true;
  const ctx = buildContext(question);
  try {
    const answer = await streamAnswer(
      [{ role: 'system', content: systemPrompt(ctx) }, ...history.slice(-8)], bubble);
    bubble.innerHTML = mdLite(answer);
    renderRefs(bubble, answer, ctx);
    history.push({ role: 'assistant', content: answer });
  } catch (e) {
    bubble.classList.add('err');
    bubble.textContent = e.message || '网络异常，请稍后再试。';
    history.pop();
  } finally {
    $('#chat-send').disabled = false;
    $('#chat-messages').scrollTop = 1e9;
  }
}

function refreshKeyPanel() {
  const has = !!getKey();
  $('#key-hint').textContent = has ? '已配置 DeepSeek Key（仅存本机浏览器）。' : '填入你的 DeepSeek API Key（只保存在本机浏览器）：';
  $('#key-clear').hidden = !has;
}
$('#key-save').addEventListener('click', () => {
  const v = $('#key-input').value.trim();
  if (!v) return;
  localStorage.setItem(KEY_NAME, v);
  $('#key-input').value = '';
  refreshKeyPanel();
});
$('#key-clear').addEventListener('click', () => { localStorage.removeItem(KEY_NAME); refreshKeyPanel(); });
$('#chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#chat-input').value.trim();
  if (!q) return;
  $('#chat-input').value = '';
  send(q);
});

const SUGGESTS = [
  '30 天内截止的项目有哪些',
  '有哪些联培博士项目',
  '西湖大学博士怎么申请',
  '数学方向有哪些暑校可以关注',
];
$('#suggest-row').innerHTML = SUGGESTS.map(s => `<button class="suggest">${esc(s)}</button>`).join('');
$('#suggest-row').addEventListener('click', e => {
  const b = e.target.closest('.suggest');
  if (!b) return;
  $('#chat-input').value = b.textContent;
  $('#chat-input').focus();
});

/* ---------- 启动 ---------- */
refreshKeyPanel();
if (!getKey()) $('#key-panel').hidden = false;
addMsg('msg-ai', '先在下方填入 DeepSeek API Key（platform.deepseek.com 可申请，只存在本机浏览器）。之后直接提问：涉及截止日期、名额等事实，我只引用站内收录的条目并附原文链接。');
boot();
