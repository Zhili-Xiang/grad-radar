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

/* ---------- 板块/地区/二级学科 ---------- */
const REGION_ORDER = ['港澳', '欧陆', '英国', '美国', '加拿大', '澳大利亚', '新西兰', '日本', '韩国', '东南亚', '中东', '拉美', '中亚'];
const FLAG = {
  '中国香港': '🇭🇰', '中国澳门': '🇲🇴', '德国': '🇩🇪', '法国': '🇫🇷', '瑞士': '🇨🇭', '奥地利': '🇦🇹',
  '荷兰': '🇳🇱', '比利时': '🇧🇪', '瑞典': '🇸🇪', '丹麦': '🇩🇰', '挪威': '🇳🇴', '芬兰': '🇫🇮',
  '意大利': '🇮🇹', '西班牙': '🇪🇸', '葡萄牙': '🇵🇹', '波兰': '🇵🇱', '俄罗斯': '🇷🇺', '英国': '🇬🇧',
  '美国': '🇺🇸', '加拿大': '🇨🇦', '澳大利亚': '🇦🇺', '新西兰': '🇳🇿', '日本': '🇯🇵', '韩国': '🇰🇷',
  '新加坡': '🇸🇬', '马来西亚': '🇲🇾', '泰国': '🇹🇭', '以色列': '🇮🇱', '爱尔兰': '🇮🇪',
  '巴西': '🇧🇷', '哈萨克斯坦': '🇰🇿', '其他': '🌍',
};
const FIELDS_ALL = ['数学物理', '生物医学', '化学材料', '计科软工', '电子信息', '其他交叉'];
const SUBFIELDS = {
  '数学物理': ['数学', '物理学', '天文学', '核科学与技术', '量子科技', '力学与精密测量'],
  '生物医学': ['分子生物学', '细胞生物学', '神经科学', '计算生物学', '免疫学', '遗传与基因组学',
    '微生物与病原', '药学与转化医学', '生物医学工程', '生态与演化', '生物综合'],
  '化学材料': ['化学', '材料科学', '化学工程'],
  '计科软工': ['人工智能', '计算机系统', '软件工程', '数据科学', '网络安全'],
  '电子信息': ['微电子与集成电路', '通信', '光电', '自动化与机器人', '仪器', '电气'],
  '其他交叉': ['综合'],
};
const subLabel = s => s === '生物综合' ? '生物·综合' : (s === '综合' ? '综合' : s);
const logoFor = e => {
  try {
    let h = new URL(e.url).hostname;
    h = h.replace(/^(www|yzb|zsb|zs|gs|gradschool|graduate|yjs|admission|admissions|grad)\./, '');
    return `https://icons.duckduckgo.com/ip3/${h}.ico`;
  } catch (_) { return ''; }
};
const boardOf = e => e.board || 'domestic';

let DATA = null;
const state = {
  school: '全部', degree: '全部', field: '全部', subfield: '全部', q: '', sort: 'urgency', hideExpired: true,
  camp: '全部', campField: '全部', campSub: '全部',
};
const boardState = {
  intl: { region: '全部', country: '全部', subfield: '全部', degree: '全部', q: '', sort: 'tier', hideExpired: true, view: 'school' },
  overseas: { region: '全部', country: '全部', subfield: '全部', degree: '全部', q: '', sort: 'tier', hideExpired: true, view: 'school' },
};
const curSchool = { intl: null, overseas: null };

/* ---------- 数据加载 ---------- */
async function boot() {
  try {
    const res = await fetch('data/programs.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) {
    $('#nav-updated').textContent = '数据尚未生成';
    ['program-mods', 'camp-mods'].forEach(id => {
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
  renderBoard('intl');
  renderBoard('overseas');
  renderStats(all);
  renderHeroEntries(all);
  wireJointTabs();
  if (location.hash === '#intl') setJointTab('intl');
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
  // 院校下拉只列“招生项目”区（国内板块）可见条目（未过期）出现过的院校，
  // 避免只有夏令营/已截止条目的单位点了显示为空
  const schoolCount = new Map();
  (DATA.programs || []).filter(e => boardOf(e) === 'domestic').forEach(e => {
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

  const fields = ['全部', ...FIELDS_ALL];
  chipRow($('#field-chips'), fields, state.field, v => {
    state.field = v;
    $$('#field-chips .chip').forEach(c => c.classList.toggle('on', c.dataset.v === state.field));
    renderPrograms();
  });

  fillSubfieldSelect($('#subfield-select'), (DATA.programs || []).filter(e => boardOf(e) === 'domestic'));
  $('#subfield-select').onchange = e => { state.subfield = e.target.value; renderPrograms(); };

  const campTypes = ['全部', '冬令营', '夏令营', '暑校', '学习班'];
  chipRow($('#camp-chips'), campTypes, state.camp, v => {
    state.camp = v; renderCamps();
  });
  $('#camp-field-select').onchange = e => { state.campField = e.target.value; renderCamps(); };
  fillSubfieldSelect($('#camp-subfield-select'), DATA.camps || []);
  $('#camp-subfield-select').onchange = e => { state.campSub = e.target.value; renderCamps(); };

  wireBoard('intl');
  wireBoard('overseas');
  wireMatcher();
}

/* 二级学科下拉：只列该数据集里出现过的方向，按大类 optgroup */
function fillSubfieldSelect(sel, pool) {
  const present = new Map(FIELDS_ALL.map(f => [f, new Set()]));
  pool.forEach(e => {
    if (e.subfield && present.has(e.field)) present.get(e.field).add(e.subfield);
  });
  sel.innerHTML = `<option value="全部">研究方向</option>` + FIELDS_ALL.map(f => {
    const subs = SUBFIELDS[f].length ? SUBFIELDS[f].filter(s => present.get(f).has(s)) : [];
    if (!subs.length) return '';
    return `<optgroup label="${esc(f)}">` +
      subs.map(s => `<option value="${esc(s)}">${esc(subLabel(s))}</option>`).join('') + `</optgroup>`;
  }).join('');
}

/* ---------- 卡片 ---------- */
function deadlineChip(e) {
  if (e.deadline === '滚动') return `<span class="chip-dl dl-open">滚动招生</span>`;
  if (e.deadline === '长期') return `<span class="chip-dl dl-open">长期有效</span>`;
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
  const bd = boardOf(e);
  const foreign = bd !== 'domestic';
  const degree = e.degree || '';
  const tags = (e.tags || []).filter(t => t !== '往期参考').slice(0, 3);
  const pastBadge = e.lastCycle
    ? '<span class="badge-past">去年通知 · 今年未发</span>'
    : (isPast ? '<span class="badge-past">往期参考</span>' : '');
  const logo = logoFor(e);
  const schoolName = foreign && e.schoolZh
    ? (e.schoolAbbr ? `${e.schoolZh} · ${e.schoolAbbr}` : e.schoolZh)
    : (foreign ? (e.school || '') : (e.schoolShort || e.school || ''));
  const schoolNameFull = foreign && e.schoolZh && e.schoolZh !== e.school ? ` title="${esc(e.school)}"` : '';
  const tierBadge = e.tier === 0 ? '<span class="chip-tier t0">★ 顶尖</span>'
    : (e.tier === 1 ? '<span class="chip-tier t1">知名</span>' : '');
  const reach = e._reach ? '<span class="chip-tier t0">冲刺位</span>' : '';
  const partner = foreign && e.partner ? `<span class="chip-partner">× ${esc(e.partner)}</span>` : '';
  const place = foreign && e.country ? `<span class="chip-place">${FLAG[e.country] || ''} ${esc(e.country)}</span>` : '';
  const fund = e.funding && e.funding !== '未知' ? `<span class="chip-fund fu-${esc(e.funding)}">${esc(e.funding)}</span>` : '';
  const ielts = e.ielts ? `<span class="chip-ielts">IELTS ${esc(e.ielts)}</span>` : '';
  const sub = foreign && e.subfield && e.subfield !== '综合' && e.subfield !== '生物综合'
    ? `<span class="chip-sub f-${esc(e.field)}">${esc(subLabel(e.subfield))}</span>` : '';
  return `
<article class="card reveal${expired ? ' expired' : ''}${foreign ? ' card-foreign' : ''}" data-field="${esc(e.field)}" style="transition-delay:${Math.min((i % 9) * 45, 360)}ms">
  <div class="card-top">
    ${logo ? `<img class="sch-logo" src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <span class="chip-school"${schoolNameFull}>${esc(schoolName)}</span>
    ${partner}
    ${(e.fields || [e.field]).filter(Boolean).slice(0, foreign ? 1 : 2).map(f => `<span class="chip-field f-${esc(f)}">${esc(f)}</span>`).join('')}
    ${(e.fields || []).length > (foreign ? 1 : 2) ? `<span class="chip-field f-其他交叉">+${(e.fields || []).length - (foreign ? 1 : 2)}</span>` : ''}
    ${degree ? `<span class="chip-degree d-${esc(degree)}">${esc(degree)}</span>` : ''}
    ${tierBadge}${reach}
    ${isNew ? '<span class="badge-new">新</span>' : ''}
    ${pastBadge}
  </div>
  <h3 class="card-title">${esc(e.title)}</h3>
  ${e.institute ? `<p class="card-inst">${esc(e.institute)}</p>` : ''}
  <p class="card-hl">${esc(e.desc || e.highlights || e.snippet || '')}</p>
  ${foreign && e.schoolDesc ? `<p class="card-schdesc">${esc(e.schoolDesc)}</p>` : ''}
  ${(e.requirements || []).length ? `<p class="card-req"><span class="req-label">报名条件</span>${esc(e.requirements.join('；'))}</p>` : ''}
  ${tags.length ? `<div class="card-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
  ${(place || fund || ielts || sub) ? `<div class="card-meta">${place}${sub}${fund}${ielts}</div>` : ''}
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
  return [e.school, e.schoolShort, e.institute, e.partner, e.country, e.region, e.subfield,
    e.title, e.highlights, e.desc, e.schoolDesc, e.degree,
    (e.fields || [e.field]).join(' '), (e.tags || []).join(' ')].join(' ').toLowerCase();
}

function renderPrograms() {
  if (!DATA) return;
  [...pgPages.keys()].filter(k => k.startsWith('pf-')).forEach(k => pgPages.delete(k));
  let list = (DATA.programs || []).filter(e =>
    boardOf(e) === 'domestic' &&
    (state.school === '全部' || e.schoolShort === state.school || e.school === state.school) &&
    (state.degree === '全部' || e.degree === state.degree || (e.tags || []).includes(state.degree)) &&
    matchField(e, state.field) &&
    (state.subfield === '全部' || (e.subfield || '') === state.subfield));
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
  const groups = state.field === '全部'
    ? FIELDS.map(f => [f, list.filter(e => e.field === f)]).filter(g => g[1].length)
    : [[state.field, list]];
  const forceOpen = !!state.q || state.field !== '全部';
  $('#program-mods').innerHTML = groups.length
    ? groups.map(([name, items], i) => moduleHTML('pf-' + name, name, items, forceOpen || i === 0)).join('')
    : '';
  registerGrids($('#program-mods'));
  $('#program-empty').hidden = list.length > 0;
}

function renderCamps() {
  if (!DATA) return;
  [...pgPages.keys()].filter(k => k.startsWith('cf-')).forEach(k => pgPages.delete(k));
  let list = (DATA.camps || []).filter(e =>
    (state.camp === '全部' || e.degree === state.camp) &&
    matchField(e, state.campField) &&
    (state.campSub === '全部' || (e.subfield || '') === state.campSub));
  list.sort((a, b) => {
    const ka = daysUntil(a.startDate) ?? daysUntil(a.deadline);
    const kb = daysUntil(b.startDate) ?? daysUntil(b.deadline);
    const va = ka === null ? 1e9 : (ka < 0 ? 1e9 + ka : ka);
    const vb = kb === null ? 1e9 : (kb < 0 ? 1e9 + kb : kb);
    return va - vb;
  });
  const types = ['冬令营', '夏令营', '暑校', '学习班'];
  const groups = state.camp === '全部'
    ? [...types, ...[...new Set(list.map(e => e.degree))].filter(d => !types.includes(d))]
        .map(t => [t, list.filter(e => e.degree === t)]).filter(g => g[1].length)
    : [[state.camp, list]];
  $('#camp-mods').innerHTML = groups.length
    ? groups.map(([name, items], i) => moduleHTML('cf-' + name, name, items, i === 0)).join('')
    : '';
  registerGrids($('#camp-mods'));
  $('#camp-empty').hidden = list.length > 0;
}

/* ---------- 可折叠模块 + 横向翻页 ---------- */
const FIELDS = ['数学物理', '生物医学', '化学材料', '计科软工', '电子信息', '其他交叉'];
const modOpen = new Set();     // 用户主动展开/收起过的模块
const modTouched = new Set();  // 是否被用户操作过（用于默认展开第一个模块）
const pgPages = new Map();     // 模块 → 当前页码（从 0 计）
const pgRegistry = new Map();  // 模块 → { items, pp, grid }

function perPageFor(w, n) {
  let pp = 0;
  if (w >= 980) pp = 6;
  else if (w >= 640) pp = 4;
  else pp = 2;
  if ((n || 0) > 150) pp *= 3;       // 大库（如 DAAD）加大页深，避免翻几十页
  else if ((n || 0) > 40) pp *= 2;
  return pp;
}
const pagesOf = rec => Math.max(1, Math.ceil(rec.items.length / rec.pp));

function moduleHTML(key, name, items, open, wm, countText) {
  open = modTouched.has(key) ? modOpen.has(key) : open;
  if (!pgPages.has(key)) pgPages.set(key, 0);
  const pp = perPageFor(innerWidth, items.length);
  const reg = { items, pp, grid: null };
  pgRegistry.set(key, reg);
  const pages = pagesOf(reg);
  const page = Math.min(pgPages.get(key), pages - 1);
  pgPages.set(key, page);
  const slice = items.slice(page * pp, page * pp + pp);
  const wmField = wm || (items[0] && items[0].field) || '';
  return `
<section class="mod${open ? ' open' : ''} wm-${esc(wmField)}" data-mod="${esc(key)}">
  <button class="mod-head" aria-expanded="${open}">
    <span class="mod-name">${esc(name)}</span>
    <span class="mod-count">${esc(countText || items.length + ' 条')}</span>
    <span class="mod-chev" aria-hidden="true"><svg viewBox="0 0 12 8" width="12" height="8"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  </button>
  <div class="mod-body"><div class="mod-clip">
    <div class="pg-grid card-grid">${slice.map((e, i) => cardHTML(e, i)).join('')}</div>
    ${pages > 1 ? `
    <div class="pg-ctl">
      <button class="pg-btn pg-prev"${page === 0 ? ' disabled' : ''} aria-label="上一页">‹</button>
      <span class="pg-ind">${page + 1} / ${pages} 页</span>
      <button class="pg-btn pg-next"${page === pages - 1 ? ' disabled' : ''} aria-label="下一页">›</button>
    </div>` : ''}
  </div></div>
</section>`;
}

function registerGrids(root) {
  root.querySelectorAll('.mod').forEach(mod => {
    const key = mod.dataset.mod;
    const reg = pgRegistry.get(key);
    if (reg) reg.grid = mod.querySelector('.pg-grid');
  });
  observeReveals();
}

function goPage(key, dir) {
  const reg = pgRegistry.get(key);
  if (!reg || !reg.grid) return;
  const pages = pagesOf(reg);
  const p = Math.max(0, Math.min(pages - 1, (pgPages.get(key) || 0) + dir));
  pgPages.set(key, p);
  reg.grid.innerHTML = reg.items.slice(p * reg.pp, p * reg.pp + reg.pp).map((e, i) => cardHTML(e, i)).join('');
  reg.grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const mod = document.querySelector(`[data-mod="${CSS.escape(key)}"]`);
  if (mod) {
    const ind = mod.querySelector('.pg-ind');
    if (ind) ind.textContent = `${p + 1} / ${pages} 页`;
    const prev = mod.querySelector('.pg-prev'), next = mod.querySelector('.pg-next');
    if (prev) prev.disabled = p === 0;
    if (next) next.disabled = p === pages - 1;
  }
  observeReveals();
}

document.addEventListener('click', e => {
  const head = e.target.closest('.mod-head');
  if (head) {
    const mod = head.closest('.mod');
    const key = mod.dataset.mod;
    mod.classList.toggle('open');
    const nowOpen = mod.classList.contains('open');
    head.setAttribute('aria-expanded', nowOpen);
    modTouched.add(key);
    nowOpen ? modOpen.add(key) : modOpen.delete(key);
    return;
  }
  const btn = e.target.closest('.pg-btn');
  if (btn && !btn.disabled) {
    const holder = btn.closest('[data-mod]');
    const key = holder && holder.dataset.mod;
    const reg = key && pgRegistry.get(key);
    if (reg && reg.grid && reg.items.length) goPage(key, btn.classList.contains('pg-next') ? 1 : -1);
  }
});

let rsTimer = null;
addEventListener('resize', () => {
  clearTimeout(rsTimer);
  rsTimer = setTimeout(() => {
    pgPages.clear();
    renderPrograms(); renderCamps();
    renderBoard('intl'); renderBoard('overseas');
    if (!$('#match-out').hidden) runMatch();
    if (curHub) openHub(curHub); else renderJoint();
  }, 180);
});

/* ---------- 国际联培 / 海外专区 ---------- */
const boardPrograms = board => (DATA.programs || []).filter(e => boardOf(e) === board);
const tierCmp = (a, b) => {
  const ta = a.tier ?? 9, tb = b.tier ?? 9;
  if (ta !== tb) return ta - tb;
  const da = daysUntil(a.deadline), db = daysUntil(b.deadline);
  const va = da === null ? 1e9 : (da < 0 ? 1e9 + da : da);
  const vb = db === null ? 1e9 : (db < 0 ? 1e9 + db : db);
  if (va !== vb) return va - vb;
  return (b.publishedAt || '').localeCompare(a.publishedAt || '');
};
const urgencyCmp = (a, b) => {
  const da = daysUntil(a.deadline), db = daysUntil(b.deadline);
  const va = da === null ? 1e9 : (da < 0 ? 1e9 + da : da);
  const vb = db === null ? 1e9 : (db < 0 ? 1e9 + db : db);
  if (va !== vb) return va - vb;
  return (b.publishedAt || '').localeCompare(a.publishedAt || '');
};

function renderBoard(board) {
  if (!DATA) return;
  const st = boardState[board];
  const pre = board === 'intl' ? 'if-' : 'of-';
  const sp = board === 'intl' ? 'is-' : 'os-';
  const wallKey = board === 'intl' ? 'is-wall' : 'os-wall';
  [...pgPages.keys()]
    .filter(k => k !== wallKey && (k.startsWith(pre) || k.startsWith(sp) || k.startsWith('sd-' + board)))
    .forEach(k => pgPages.delete(k));
  let list = boardPrograms(board);
  if (st.region !== '全部') list = list.filter(e => (e.region || '') === st.region);
  if (st.country !== '全部') list = list.filter(e => (e.country || '') === st.country);
  if (st.degree !== '全部') list = list.filter(e => (e.degree || '').includes(st.degree) || (e.tags || []).includes(st.degree));
  if (st.subfield !== '全部') list = list.filter(e => (e.subfield || '') === st.subfield);
  if (st.q) list = list.filter(e => searchable(e).includes(st.q.toLowerCase()));
  if (st.hideExpired) list = list.filter(e => { const d = daysUntil(e.deadline); return d === null || d >= 0; });

  const modsEl = $(`#${board}-mods`);
  const wrap = $(`#${board}-school-wrap`);
  const detail = $(`#${board}-school-detail`);
  if (st.view === 'school') {
    modsEl.hidden = true;
    wrap.hidden = false;
    if (curSchool[board]) openSchool(board, curSchool[board]);
    else { detail.hidden = true; renderSchoolWall(board, list); }
    $(`#${board}-empty`).hidden = list.length > 0;
    return;
  }
  wrap.hidden = true;
  detail.hidden = true;
  modsEl.hidden = false;

  // 名校优先时博士在前、硕士在后；截止模式下跨学位按时间排
  // "硕士/博士""硕博连读"等变体视为博士通道（两边都能申）
  const isPhdLike = e => /博士|硕博/.test(e.degree || '');
  const isMscOnly = e => e.degree === '硕士';
  const degRank = e => isPhdLike(e) ? 0 : (isMscOnly(e) ? 1 : 2);
  if (st.sort === 'urgency') list.sort(urgencyCmp);
  else list.sort((a, b) => (degRank(a) - degRank(b)) || tierCmp(a, b));

  let groups;
  if (st.region === '全部') {
    groups = REGION_ORDER.filter(r => list.some(e => e.region === r))
      .map(r => [r, list.filter(e => e.region === r)]);
  } else {
    const byCountry = new Map();
    list.forEach(e => { if (e.country) byCountry.set(e.country, (byCountry.get(e.country) || 0) + 1); });
    const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    groups = countries.length > 1
      ? countries.map(c => [`${st.region} · ${c}`, list.filter(e => e.country === c)])
      : [[st.region, list]];
  }
  const forceOpen = st.region !== '全部' || st.subfield !== '全部' || !!st.q;
  modsEl.innerHTML = groups.length
    ? groups.map(([name, items], i) =>
        moduleHTML(pre + name, name, items, forceOpen || i === 0, '', degCountText(items))).join('')
    : '';
  registerGrids(modsEl);
  $(`#${board}-empty`).hidden = list.length > 0;
}

function degCountText(items) {
  const n = items.filter(e => e.degree === '博士').length;
  const m = items.filter(e => e.degree === '硕士').length;
  const both = items.filter(e => e.degree !== '博士' && e.degree !== '硕士' && /博士|硕博/.test(e.degree || '')).length;
  const r = items.length - n - m - both;
  const parts = [`共 ${items.length} 条`];
  if (n) parts.push(`博 ${n}`);
  if (m) parts.push(`硕 ${m}`);
  if (both) parts.push(`硕博 ${both}`);
  if (r) parts.push(`其他 ${r}`);
  return parts.join(' · ');
}

/* ---------- 按学校聚合视图 ---------- */
function schTitleOf(g) {
  if (g.zh) return g.abbr ? `${g.zh} · ${g.abbr}` : g.zh;
  return g.school;
}

function renderSchoolWall(board, list) {
  const grid = $(`#${board}-school-grid`);
  const groups = new Map();
  list.forEach(e => {
    if (!groups.has(e.school)) groups.set(e.school, []);
    groups.get(e.school).push(e);
  });
  const gs = [...groups.entries()].map(([school, items]) => ({
    school, items,
    tier: Math.min(...items.map(e => e.tier ?? 9)),
    zh: (items.find(e => e.schoolZh) || {}).schoolZh,
    abbr: (items.find(e => e.schoolAbbr) || {}).schoolAbbr,
    country: (items.find(e => e.country) || {}).country,
    region: (items.find(e => e.region) || {}).region,
    desc: (items.find(e => e.schoolDesc) || {}).schoolDesc || '',
  }));
  gs.sort((a, b) => a.tier - b.tier || b.items.length - a.items.length || a.school.localeCompare(b.school));
  const cards = gs.map(g => {
    const subs = [...new Set(g.items.map(e => e.subfield).filter(s => s && s !== '综合' && s !== '生物综合'))].slice(0, 3);
    const logo = logoFor(g.items[0]);
    let meta;
    if (board === 'intl') {
      const partners = [...new Set(g.items.map(e => e.partner).filter(Boolean))];
      meta = (partners.length ? `× ${partners.slice(0, 2).join('、')}${partners.length > 2 ? ` 等 ${partners.length} 家` : ''} · ` : '') + degCountText(g.items);
    } else {
      meta = `${FLAG[g.country] || ''} ${g.country || g.region || ''} · ${degCountText(g.items)}`;
    }
    return `
<button class="sch-card" data-school="${esc(g.school)}">
  <div class="sch-top">
    ${logo ? `<img class="sch-logo big" src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <span class="sch-name">${esc(schTitleOf(g))}</span>
    ${g.tier === 0 ? '<span class="chip-tier t0">★ 顶尖</span>' : (g.tier === 1 ? '<span class="chip-tier t1">知名</span>' : '')}
  </div>
  <span class="sch-meta">${esc(meta)}</span>
  ${g.desc ? `<p class="sch-desc">${esc(g.desc)}</p>` : ''}
  ${subs.length ? `<div class="sch-subs">${subs.map(s => `<span class="chip-sub f-${esc((g.items.find(e => e.subfield === s) || {}).field || '生物医学')}">${esc(subLabel(s))}</span>`).join('')}</div>` : ''}
</button>`;
  });
  renderPaged(board === 'intl' ? 'is-wall' : 'os-wall', grid, cards, hubPerPageFor(innerWidth));
  grid.onclick = e => {
    const b = e.target.closest('.sch-card');
    if (b) openSchool(board, b.dataset.school);
  };
}

function openSchool(board, school) {
  curSchool[board] = school;
  const all = boardPrograms(board).filter(e => e.school === school);
  const phd = all.filter(e => /博士|硕博/.test(e.degree || ''));
  const msc = all.filter(e => e.degree === '硕士');
  const rest = all.filter(e => !/博士|硕博/.test(e.degree || '') && e.degree !== '硕士');
  $(`#${board}-school-wrap`).hidden = true;
  const detail = $(`#${board}-school-detail`);
  detail.hidden = false;
  const g = {
    school,
    zh: (all.find(e => e.schoolZh) || {}).schoolZh,
    abbr: (all.find(e => e.schoolAbbr) || {}).schoolAbbr,
    country: (all.find(e => e.country) || {}).country,
    region: (all.find(e => e.region) || {}).region,
    desc: (all.find(e => e.schoolDesc) || {}).schoolDesc || '',
  };
  $(`#${board}-school-name`).textContent = schTitleOf(g);
  const place = board === 'overseas'
    ? `${FLAG[g.country] || ''} ${g.country || g.region || ''}`
    : `合作 ${[...new Set(all.map(e => e.partner).filter(Boolean))].length} 家境外机构`;
  $(`#${board}-school-sub`).textContent = `${place} · ${degCountText(all)}${g.desc ? ' ｜ ' + g.desc : ''}`;
  const modsEl = $(`#${board}-school-mods`);
  const parts = [];
  if (phd.length) parts.push(moduleHTML(`sd-${board}-博士`, '博士', phd.sort(tierCmp), true, '', degCountText(phd)));
  if (msc.length) parts.push(moduleHTML(`sd-${board}-硕士`, '硕士', msc.sort(tierCmp), true, '', degCountText(msc)));
  if (rest.length) {
    const degName = rest[0].degree || '其他';
    parts.push(moduleHTML(`sd-${board}-${degName}`, degName, rest.sort(tierCmp), true, '', degCountText(rest)));
  }
  modsEl.innerHTML = parts.join('');
  registerGrids(modsEl);
  observeReveals();
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeSchool(board) {
  curSchool[board] = null;
  $(`#${board}-school-detail`).hidden = true;
  $(`#${board}-school-wrap`).hidden = false;
  renderBoard(board);
  $(`#${board}-school-wrap`).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireBoard(board) {
  const st = boardState[board];
  const pool = boardPrograms(board);
  const regions = REGION_ORDER.filter(r => pool.some(e => e.region === r));
  const syncViewChips = () => {
    [...document.querySelectorAll(`#${board}-view .chip`)]
      .forEach(c => c.classList.toggle('on', c.dataset.v === st.view));
  };
  chipRow($(`#${board}-chips`), ['全部', ...regions], st.region, v => {
    st.region = v; st.country = '全部';
    if (st.view !== 'region') { st.view = 'region'; curSchool[board] = null; syncViewChips(); }
    updateCountryChips(board);
    renderBoard(board);
  });
  updateCountryChips(board);
  fillSubfieldSelect($(`#${board}-subfield`), pool);
  $(`#${board}-subfield`).value = '全部';
  $(`#${board}-search`).addEventListener('input', e => { st.q = e.target.value.trim(); renderBoard(board); });
  $(`#${board}-degree`).onchange = e => { st.degree = e.target.value; renderBoard(board); };
  $(`#${board}-sort`).onchange = e => { st.sort = e.target.value; renderBoard(board); };
  $(`#${board}-hide-expired`).addEventListener('change', e => {
    st.hideExpired = e.target.checked;
    updateCountryChips(board);
    renderBoard(board);
  });
  // 视图切换：按地区 / 按学校
  const viewRow = $(`#${board}-view`);
  viewRow.addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b || b.dataset.v === st.view) return;
    st.view = b.dataset.v;
    curSchool[board] = null;
    [...viewRow.querySelectorAll('.chip')].forEach(c => c.classList.toggle('on', c.dataset.v === st.view));
    renderBoard(board);
  });
  $(`#${board}-school-back`).addEventListener('click', () => closeSchool(board));
  $(`#${board}-school-pager`).addEventListener('click', e => {
    const btn = e.target.closest('.pg-btn');
    if (!btn || btn.disabled) return;
    const key = board === 'intl' ? 'is-wall' : 'os-wall';
    pgPages.set(key, (pgPages.get(key) || 0) + (btn.classList.contains('pg-next') ? 1 : -1));
    renderBoard(board);
    $(`#${board}-school-grid`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function updateCountryChips(board) {
  const st = boardState[board];
  const row = $(`#${board}-country-chips`);
  if (st.region === '全部') { row.hidden = true; return; }
  const pool = boardPrograms(board).filter(e => {
    if (e.region !== st.region) return false;
    if (!st.hideExpired) return true;
    const d = daysUntil(e.deadline);
    return d === null || d >= 0;
  });
  const counts = new Map();
  pool.forEach(e => { if (e.country) counts.set(e.country, (counts.get(e.country) || 0) + 1); });
  const countries = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const multi = countries.length > 1;
  row.hidden = !multi;
  if (multi) {
    chipRow(row, ['全部', ...countries], st.country, v => {
      st.country = v;
      [...row.querySelectorAll('.chip')].forEach(c => c.classList.toggle('on', c.dataset.v === st.country));
      renderBoard(board);
    });
  } else if (st.country !== '全部') {
    st.country = '全部';
  }
}

/* ---------- 背景匹配器 ---------- */
function wireMatcher() {
  const pool = [...boardPrograms('overseas'), ...boardPrograms('intl')];
  const fieldSel = $('#m-field'), subSel = $('#m-sub');
  fieldSel.innerHTML = `<option value="">全部大类</option>` +
    FIELDS_ALL.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  const refreshSub = () => {
    const f = fieldSel.value;
    const subs = f ? (SUBFIELDS[f] || []).filter(s => pool.some(e => e.subfield === s)) : [];
    subSel.innerHTML = `<option value="">${f ? '全部方向' : '先选大类'}</option>` +
      subs.map(s => `<option value="${esc(s)}">${esc(subLabel(s))}</option>`).join('');
    subSel.disabled = !f;
  };
  refreshSub();
  fieldSel.onchange = refreshSub;
  const regions = REGION_ORDER.filter(r => pool.some(e => e.region === r));
  $('#m-region').innerHTML = `<option value="">全部地区</option>` +
    regions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  $('#m-run').addEventListener('click', runMatch);
}

function runMatch() {
  if (!DATA) return;
  const field = $('#m-field').value;
  const sub = $('#m-sub').value;
  const region = $('#m-region').value;
  const ielts = parseFloat($('#m-ielts').value);
  const gpa = parseFloat($('#m-gpa').value);
  const bg = $('#m-bg').value;
  const fund = $('#m-fund').value;

  let pool = [...boardPrograms('overseas'), ...boardPrograms('intl')];
  if (field) pool = pool.filter(e => (e.fields || []).includes(field));
  if (sub) pool = pool.filter(e => (e.subfield || '') === sub);
  if (region) pool = pool.filter(e => (e.region || '') === region);

  const ok = [];
  let failedLang = 0, failedFund = 0, unknown = 0;
  pool.forEach(e => {
    if (Number.isFinite(ielts) && e.ielts && e.ielts > ielts + 1e-9) { failedLang++; return; }
    if (Number.isFinite(gpa) && e.gpa && e.gpa > gpa + 1e-9) { failedLang++; return; }
    if (fund === '仅全奖' && e.funding !== '全奖') { failedFund++; return; }
    if (!e.ielts && !e.gpa) unknown++;
    if (bg === '双非' && e.tier === 0) e._reach = true; else e._reach = false;
    ok.push(e);
  });
  // CSC 是学生自申通道，海外博士几乎都可行：不做硬过滤，仅把更适合自带资助的排前
  const fundRank = e => fund === 'CSC可申请'
    ? ({ '学费减免': 0, '未知': 1, '全奖': 2 }[e.funding] ?? 3)
    : 0;
  ok.sort((a, b) => {
    if (fund === '全奖优先') {
      const fa = (a.funding === '全奖') ? 0 : 1, fb = (b.funding === '全奖') ? 0 : 1;
      if (fa !== fb) return fa - fb;
    }
    const ra = fundRank(a), rb = fundRank(b);
    if (ra !== rb) return ra - rb;
    return tierCmp(a, b);
  });

  const out = $('#match-out'), grid = $('#match-grid'), sum = $('#match-sum');
  out.hidden = false;
  grid.innerHTML = ok.slice(0, 18).map((e, i) => cardHTML(e, i)).join('');
  const bits = [`可选 ${ok.length} 条`];
  if (unknown) bits.push(`${unknown} 条要求未标注（保留展示）`);
  if (failedLang) bits.push(`${failedLang} 条因语言/均分不够被筛掉`);
  if (failedFund) bits.push(`${failedFund} 条不满足资助条件`);
  if (fund === 'CSC可申请') bits.push('海外博士大多可自申 CSC，已按适合自带资助优先排序');
  if (bg === '双非') bits.push('顶尖档已标「冲刺位」');
  sum.textContent = bits.join(' · ');
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  observeReveals();
}

/* ---------- 联培专区 ---------- */
const HUB_TEST = {
  '深圳理工大学': /深理工|深圳理工/, '深圳医学科学院': /SMART|深圳医科|深圳湾/, '广州实验室': /广州(国家)?实验室/,
  '鹏城实验室': /鹏城/, '张江实验室': /张江/, '临港实验室': /临港/, '苏州实验室': /苏州(国家)?实验室/,
  '崂山实验室': /崂山/, '昌平实验室': /昌平/, '乾元实验室': /乾元/, '钱塘实验室': /钱塘/, '瓯江实验室': /瓯江/,
  '崖州湾实验室': /崖州湾/, '中关村实验室': /中关村/, '启元实验室': /启元/, '军事科学院': /军事科学院|军科院/,
  '辽宁材料实验室': /辽宁材料/, '太行实验室': /太行/, '北京通研院': /通研院|通用人工智能/, '中国商飞': /商飞/,
  '中国星网': /星网/, '大湾区大学': /大湾区/, '上海AI实验室': /上海人工智能|shlab/, 'NIBS/北生所': /NIBS|北生所|TIMBR/,
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
function hubPerPageFor(w) {
  if (w >= 980) return 12;
  if (w >= 640) return 8;
  return 4;
}
let curHub = null;
function renderJoint() {
  if (!DATA) return;
  const all = [...(DATA.programs || []), ...(DATA.camps || [])].filter(e => e.hub);
  const groups = new Map();
  all.forEach(e => {
    if (!groups.has(e.hub)) groups.set(e.hub, []);
    groups.get(e.hub).push(e);
  });
  const hubs = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const cards = hubs.map(([hub, list]) => {
    const partners = [...new Set(list.map(e => partnerOf(e, hub)).filter(Boolean))];
    const shown = partners.slice(0, 5);
    const more = partners.length - shown.length;
    return `
<button class="hub-card" data-hub="${esc(hub)}">
  <div class="hub-top"><span class="hub-name">${esc(hub)}</span><span class="hub-badge">${list.length} 个项目</span></div>
  <span class="hub-count">合作高校/机构 ${partners.length} 家</span>
  <div class="hub-partners">${shown.map(p => `<span>${esc(p)}</span>`).join('')}${more > 0 ? `<span class="more">等 ${partners.length} 家</span>` : ''}</div>
</button>`;
  });
  renderPaged('joint-hubs', $('#joint-grid'), cards, hubPerPageFor(innerWidth));
  $('#joint-grid').onclick = e => {
    const b = e.target.closest('.hub-card');
    if (!b) return;
    openHub(b.dataset.hub);
  };
}
function renderPaged(key, gridEl, html, pp) {
  // 字符串分页：切片渲染 + 更新同容器内的翻页控件
  if (!pgPages.has(key)) pgPages.set(key, 0);
  const pages = Math.ceil(html.length / pp) || 1;
  const page = Math.max(0, Math.min(pgPages.get(key), pages - 1));
  pgPages.set(key, page);
  gridEl.innerHTML = html.slice(page * pp, page * pp + pp).join('');
  const ctl = gridEl.parentElement.querySelector('.pg-ctl[data-mod="' + key + '"]');
  if (ctl) {
    ctl.hidden = pages <= 1;
    const ind = ctl.querySelector('.pg-ind');
    if (ind) ind.textContent = `${page + 1} / ${pages} 页`;
    const prev = ctl.querySelector('.pg-prev'), next = ctl.querySelector('.pg-next');
    if (prev) prev.disabled = page === 0;
    if (next) next.disabled = page === pages - 1;
  }
}
function openHub(hub) {
  curHub = hub;
  const all = [...(DATA.programs || []), ...(DATA.camps || [])].filter(e => e.hub === hub);
  const partners = [...new Set(all.map(e => partnerOf(e, hub)).filter(Boolean))];
  $('#joint-grid').hidden = true;
  $('#joint-grid-pager').hidden = true;
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
  const pp = perPageFor(innerWidth, all.length);
  const key = 'jd-' + hub;
  if (!pgPages.has(key)) pgPages.set(key, 0);
  const reg = { items: all, pp, grid: $('#joint-cards') };
  pgRegistry.set(key, reg);
  const pages = pagesOf(reg);
  const page = Math.min(pgPages.get(key), pages - 1);
  pgPages.set(key, page);
  reg.grid.innerHTML = all.slice(page * pp, page * pp + pp).map((e, i) => cardHTML(e, i)).join('');
  const ctl = $('#joint-cards-pager');
  ctl.hidden = pages <= 1;
  ctl.dataset.mod = key;
  ctl.querySelector('.pg-ind').textContent = `${page + 1} / ${pages} 页`;
  ctl.querySelector('.pg-prev').disabled = page === 0;
  ctl.querySelector('.pg-next').disabled = page === pages - 1;
  observeReveals();
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#joint-back').addEventListener('click', () => {
  curHub = null;
  $('#joint-detail').hidden = true;
  $('#joint-grid').hidden = false;
  $('#joint-grid-pager').hidden = false;
  renderJoint();
  $('#joint').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#joint-grid-pager').addEventListener('click', e => {
  const btn = e.target.closest('.pg-btn');
  if (!btn || btn.disabled) return;
  pgPages.set('joint-hubs', (pgPages.get('joint-hubs') || 0) + (btn.classList.contains('pg-next') ? 1 : -1));
  renderJoint();
  $('#joint-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- hero 四入口 + 联培子标签 ---------- */
const HE_ICONS = {
  cap: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z"/><path d="M6.5 11.5V16c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4.5"/><path d="M21.5 9.5V15"/></svg>',
  rings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5s1.3-6.2 3.9-8.5Z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 21V4.5"/><path d="M5.5 5c3.5-2 6.5 2 10 0v8c-3.5 2-6.5-2-10 0"/></svg>',
};

function renderHeroEntries() {
  const box = $('#hero-entries');
  if (!box) return;
  const dom = boardPrograms('domestic').length;
  const hubs = new Set(boardPrograms('domestic').filter(e => e.hub).map(e => e.hub)).size;
  const intlN = boardPrograms('intl').length;
  const ov = boardPrograms('overseas').length;
  const camps = (DATA.camps || []).length;
  const entries = [
    ['国内硕博', '招生简章 · 直博专项', dom + ' 条在招', '#programs', 'cap'],
    ['联培专区', '国家实验室 · 新势力 · 国际联培', hubs + ' 家机构 · ' + intlN + ' 条国际', '#joint', 'rings'],
    ['海外名校', '生物医药与交叉方向', ov + ' 条 · 22 国', '#overseas', 'globe'],
    ['冬夏令营', '报名与开营日程', camps + ' 场', '#camps', 'flag'],
  ];
  box.innerHTML = entries.map(([name, sub, num, href, icon]) => `
<a class="he-card" href="${href}">
  <span class="he-icon">${HE_ICONS[icon]}</span>
  <span class="he-name">${name}</span>
  <span class="he-sub">${esc(sub)}</span>
  <span class="he-num">${esc(num)}</span>
</a>`).join('');
}

let curJointTab = 'domestic';
function setJointTab(v) {
  curJointTab = v;
  const dom = $('#joint-domestic'), intl = $('#intl');
  if (!dom || !intl) return;
  dom.hidden = v !== 'domestic';
  intl.hidden = v !== 'intl';
  $$('#joint-tabs .chip').forEach(c => c.classList.toggle('on', c.dataset.v === v));
}
function wireJointTabs() {
  const row = $('#joint-tabs');
  if (!row) return;
  row.addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (b && b.dataset.v !== curJointTab) setJointTab(b.dataset.v);
  });
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#intl') setJointTab('intl');
});

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
  '冷泉港': 'Cold Spring Harbor Laboratory', '洛克菲勒': 'Rockefeller', '马普': 'Max Planck',
  '苏黎世联邦理工': 'ETH', 'eth': 'ETH Zürich', '洛桑联邦理工': 'EPFL', 'embl': 'EMBL',
  '卡罗林斯卡': 'Karolinska', '巴斯德': 'Pasteur', 'crick': 'Crick', '桑格': 'Sanger',
  '京都': '京都大学', '东大': '东京大学', '东京大学': '東京大学', '理研': 'RIKEN',
  'kaist': 'KAIST', '首尔大学': '서울대학교', 'nus': 'NUS', 'ntu': 'NTU', 'duke-nus': 'Duke-NUS',
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
  const lines = ctx.map((e, i) => {
    const place = e.country || e.region || '';
    const sub = e.subfield && e.subfield !== '综合' && e.subfield !== '生物综合' ? '/' + e.subfield : '';
    return `[${i + 1}] ${e.school || ''}${e.partner ? '×' + e.partner : ''}${e.institute ? '·' + e.institute : ''}｜${e.title}｜${e.degree || ''}｜${(e.fields || [e.field]).join('/')}${sub}${place ? '｜' + place : ''}｜${e.deadline ? '截止' + e.deadline : '截止未注明'}${e.funding && e.funding !== '未知' ? '｜资助:' + e.funding : ''}${e.lastCycle ? '｜注意:此为去年版通知,今年新版未发布' : ''}${(e.tags || []).includes('往期参考') ? '｜注意:往期参考' : ''}${(e.requirements || []).length ? '｜报名条件:' + e.requirements.join('；') : ''}｜${e.url}`;
  });
  return `你是"升学雷达"网站的招生咨询助手。今天是 ${todayISO()}。
【站内数据库】以下是本周抓取的招生/冬夏令营条目（编号、截止日期、原文链接；含国内项目、国际联培与海外直申项目）：
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
  '生物方向欧洲有哪些全奖博士',
  '有哪些联培博士项目',
  '双非背景能冲哪些海外项目',
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
