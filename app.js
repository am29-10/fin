'use strict';

const $ = selector => document.querySelector(selector);
const KEY = 'personal-wealth-web-v2';
const LEGACY_KEY = 'personal-wealth-web-v1';
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const PAGES = {home: ['◈', 'Главная'], analytics: ['▥', 'Аналитика'], more: ['☷', 'Ещё']};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const uuid = () => crypto.randomUUID();
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const legacyCutoff = () => `${currentMonth()}-${String(new Date().getDate()).padStart(2, '0')}`;
const monthLabel = month => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
const editable = amount => `${BigInt(amount) / 100n},${String(BigInt(amount) % 100n).padStart(2, '0')}`;
function money(amount) {
  const value = BigInt(amount);
  return `${(value / 100n).toLocaleString('ru-RU')},${String(value % 100n).padStart(2, '0')} ₽`;
}

let portfolio = {version: 2, assets: [], savings: [], incomes: []};
let storageError = '';
let sourceText = '';
try {
  sourceText = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY) ?? '';
  if (sourceText) portfolio = Wealth.migrate(JSON.parse(sourceText), legacyCutoff());
} catch (error) {
  storageError = error.message;
}
let period = 12;
let editorSave;
let notifyTimer;

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}

function persist(next) {
  if (storageError) throw Error('Сначала сохраните исходную копию и восстановите корректные данные в разделе «Ещё».');
  const clean = Wealth.validate(next);
  localStorage.setItem(KEY, JSON.stringify(clean));
  portfolio = clean;
  render();
}

function mutate(change) {
  const next = structuredClone(portfolio);
  change(next);
  persist(next);
}

function button(action, title, {id = '', kind = '', className = '', label = ''} = {}) {
  return `<button type="button" class="${className}" data-action="${action}" data-id="${esc(id)}" data-kind="${kind}"${label ? ` aria-label="${esc(label)}"` : ''}>${title}</button>`;
}
const empty = (title, hint) => `<div class="empty"><strong>${title}</strong>${hint}</div>`;
const metric = (title, amount, hint, hero = false) => `<div class="card ${hero ? 'hero' : ''}"><div class="label">${title}</div><div class="value">${money(amount)}</div><div class="hint">${hint}</div></div>`;

function itemCards(kind) {
  const rows = portfolio[kind];
  if (!rows.length) return empty(kind === 'assets' ? 'Нет активов' : 'Нет накоплений', kind === 'assets' ? 'Добавьте недвижимость, автомобиль или инвестиции.' : 'Добавьте счёт, вклад или наличные.');
  return `<div class="grid items">${rows.map(item => `<article class="card item-card">
    <div class="asset-mark" aria-hidden="true">${kind === 'savings' ? '▣' : item.type === 'Автомобиль' ? '◇' : '⌂'}</div>
    <div class="item-title"><h3>${esc(item.name)}</h3><span class="label">${esc(item.type)}</span></div>
    <div class="value">${money(item.amount)}</div>
    ${item.notes ? `<p class="hint notes">${esc(item.notes)}</p>` : ''}
    <div class="item-actions">${button('edit-item', 'Изменить', {id: item.id, kind})}${button('delete-item', 'Удалить', {id: item.id, kind, className: 'danger'})}</div>
  </article>`).join('')}</div>`;
}

function distribution() {
  const groups = new Map();
  for (const item of [...portfolio.assets, ...portfolio.savings]) groups.set(item.type, (groups.get(item.type) || 0n) + BigInt(item.amount));
  const total = Wealth.total(portfolio);
  if (!total) return empty('Нет данных', 'Добавьте активы и накопления, чтобы увидеть структуру портфеля.');
  return [...groups].filter(([, amount]) => amount > 0n).sort((a, b) => a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0).map(([type, amount]) => {
    const share = Number(amount * 1000n / total) / 10;
    return `<div class="allocation"><div class="allocation-head"><span>${esc(type)}</span><strong>${money(amount)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${share}%"></div></div><div class="allocation-share">${share.toLocaleString('ru-RU')}%</div></div>`;
  }).join('');
}

function incomeChart() {
  const now = currentMonth();
  const data = Array.from({length: period}, (_, index) => {
    const month = Wealth.shiftMonth(now, index - period + 1);
    return {month, amount: Wealth.sum(portfolio.incomes.filter(item => item.month === month))};
  });
  const max = data.reduce((value, item) => item.amount > value ? item.amount : value, 1n);
  return `<div class="chart-scroll"><div class="income-chart" style="--months:${period}">${data.map(item => {
    const height = Number(item.amount * 10000n / max) / 100;
    return `<button type="button" class="chart-column" data-action="show-month" data-id="${item.month}" aria-label="${monthLabel(item.month)}: ${money(item.amount)}"><span class="bar-space"><span class="income-bar" style="height:${height}%"></span></span><span class="chart-month">${MONTHS[Number(item.month.slice(5)) - 1].slice(0, 3)}</span><span class="chart-year">${item.month.slice(0, 4)}</span></button>`;
  }).join('')}</div></div><p class="hint chart-hint">Нажмите на столбец, чтобы посмотреть сумму.</p>`;
}

function incomeRows() {
  if (!portfolio.incomes.length) return empty('Добавьте первый доход', 'Укажите сумму, месяц и год.');
  const groups = new Map();
  for (const item of [...portfolio.incomes].sort((a, b) => b.month.localeCompare(a.month))) {
    if (!groups.has(item.month)) groups.set(item.month, []);
    groups.get(item.month).push(item);
  }
  return [...groups].map(([month, items]) => `<section class="income-group"><div class="income-group-head"><h3>${monthLabel(month)}</h3><span>${money(Wealth.sum(items))}</span></div>${items.map(item => `<div class="income-row">
    <div class="row-icon" aria-hidden="true">↙</div><div class="row-main"><strong>${esc(item.category)}</strong>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</div>
    <strong class="amount green">+${money(item.amount)}</strong>
    <div class="row-actions">${button('edit-income', '✎', {id: item.id, className: 'icon', label: 'Изменить доход: ' + item.category})}${button('delete-income', '×', {id: item.id, className: 'icon', label: 'Удалить доход: ' + item.category})}</div>
  </div>`).join('')}</section>`).join('');
}

function homePage() {
  return `<div class="grid metrics">${metric('Общий капитал', Wealth.total(portfolio), 'Активы и накопления', true)}${metric('Активы', Wealth.sum(portfolio.assets), 'Текущая сумма')}${metric('Накопления', Wealth.sum(portfolio.savings), 'Деньги на счетах и наличные')}</div>
    <section class="section card"><h2>Структура портфеля</h2>${distribution()}</section>
    <section class="section"><div class="section-head"><h2>Активы <span class="count">${portfolio.assets.length}</span></h2>${button('new-item', '＋ Актив', {kind: 'assets'})}</div>${itemCards('assets')}</section>
    <section class="section"><div class="section-head"><h2>Накопления <span class="count">${portfolio.savings.length}</span></h2>${button('new-item', '＋ Счёт', {kind: 'savings'})}</div>${itemCards('savings')}</section>`;
}

function analyticsPage() {
  const now = currentMonth();
  const incomes = Wealth.incomesFor(portfolio, now, period);
  const total = Wealth.sum(incomes);
  const categories = new Map();
  incomes.forEach(item => categories.set(item.category, (categories.get(item.category) || 0n) + BigInt(item.amount)));
  return `<div class="grid metrics">${metric('Доход за 12 месяцев', Wealth.sum(Wealth.incomesFor(portfolio, now, 12)), 'Включая текущий месяц', true)}${metric('Доход за выбранный период', total, `За ${period} месяцев`)}${metric('Средний доход в месяц', total / BigInt(period), 'Включая месяцы без дохода')}</div>
    <div class="section"><div class="section-head"><h2>Доходы по месяцам</h2></div><div class="filters" role="group" aria-label="Период аналитики">${[6, 12, 24].map(count => button('period', `${count} мес.`, {id: count, className: period === count ? 'selected' : ''})).join('')}</div></div>
    <div class="grid two"><section class="card">${incomeChart()}</section><section class="card"><h2>По категориям</h2>${categories.size ? [...categories].sort((a, b) => a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0).map(([category, amount]) => `<div class="category-row"><span>${esc(category)}</span><strong>${money(amount)}</strong></div>`).join('') : empty('Пока нет доходов', 'Добавьте доход за любой месяц.')}</section></div>
    <section class="section card"><div class="section-head"><h2>Доходы</h2>${button('income', '＋ Доход')}</div>${incomeRows()}</section>`;
}

function morePage() {
  return `<div class="settings"><section class="card"><h2>Ваши данные</h2><p class="hint">Портфель хранится на этом устройстве. Сохраните копию, чтобы перенести его или восстановить после очистки браузера.</p><div class="backup-actions">${button('export', '↓ Сохранить копию')}${button('import', '↑ Восстановить копию')}${button('csv', '↓ Доходы в CSV')}</div><input type="file" accept=".json,application/json" id="import-file" hidden></section>
    <section class="section card"><h2>На домашний экран iPhone</h2><p class="hint">Откройте приложение в Safari, нажмите «Поделиться», затем «На экран Домой». Оно будет открываться отдельным приложением.</p></section></div>`;
}

function render() {
  const page = Object.hasOwn(PAGES, location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  $('nav').innerHTML = Object.entries(PAGES).map(([key, [icon, title]]) => `<a class="${page === key ? 'active' : ''}" href="#${key}"${page === key ? ' aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${title}</a>`).join('');
  $('h1').textContent = PAGES[page][1];
  $('#add').hidden = page === 'more';
  $('#add').textContent = page === 'analytics' ? '＋ Доход' : '＋ Добавить';
  $('#content').innerHTML = (storageError ? `<div class="notice" role="alert">Не удалось загрузить портфель: ${esc(storageError)} Изменения заблокированы. Исходные данные можно сохранить в разделе «Ещё».</div>` : '') + ({home: homePage, analytics: analyticsPage, more: morePage}[page])();
}

function field(key, title, value = '', extra = '') {
  return `<label for="f-${key}">${title}</label><input id="f-${key}" name="${key}" value="${esc(value)}" ${extra}>`;
}
function select(key, title, options, value) {
  return `<label for="f-${key}">${title}</label><select id="f-${key}" name="${key}">${options.map(([id, text]) => `<option value="${esc(id)}"${String(id) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
}
function typeOptions(kind, current) {
  return [...new Set([...Wealth.TYPES[kind], ...(current ? [current] : [])])].map(type => [type, type]);
}
function show(title, fields, save) {
  $('#editor').close();
  $('#dialog-title').textContent = title;
  $('#fields').innerHTML = fields;
  $('#error').textContent = '';
  $('#save').hidden = !save;
  editorSave = save;
  $('#editor').showModal();
}
function addMenu() {
  show('Что добавить?', `<div class="grid section">${button('new-item', '⌂ Актив', {kind: 'assets'})}${button('new-item', '▣ Накопления', {kind: 'savings'})}${button('income', '↙ Доход')}</div>`, null);
}
function itemEditor(kind, id) {
  if (!['assets', 'savings'].includes(kind)) return;
  const item = portfolio[kind].find(row => row.id === id);
  show(item ? 'Изменить ' + item.name : kind === 'assets' ? 'Новый актив' : 'Новые накопления',
    field('name', 'Название', item?.name || '', 'required maxlength="120" autocomplete="off"') +
    select('type', 'Тип', typeOptions(kind === 'assets' ? 'asset' : 'savings', item?.type), item?.type) +
    field('amount', 'Сумма, ₽', item ? editable(item.amount) : '', 'required inputmode="decimal" maxlength="18"') +
    field('notes', 'Комментарий', item?.notes || '', 'maxlength="1000"'), values => {
      if (!values.name.trim()) throw Error('Введите название.');
      const record = {id: item?.id || uuid(), name: values.name.trim(), type: values.type, amount: Wealth.parseMoney(values.amount), notes: values.notes};
      mutate(next => {
        if (item) next[kind][next[kind].findIndex(row => row.id === id)] = record;
        else next[kind].push(record);
      });
    });
}
function incomeEditor(id) {
  const item = portfolio.incomes.find(row => row.id === id);
  const month = item?.month || currentMonth();
  const year = Number(month.slice(0, 4));
  const currentYear = Number(currentMonth().slice(0, 4));
  const years = [...new Set([year, ...Array.from({length: currentYear - 1900 + 6}, (_, index) => currentYear + 5 - index)])].sort((a, b) => b - a);
  show(item ? 'Изменить доход' : 'Новый доход',
    field('amount', 'Сумма, ₽', item ? editable(item.amount) : '', 'required inputmode="decimal" maxlength="18"') +
    select('category', 'Категория', typeOptions('income', item?.category), item?.category) +
    `<div class="grid month-fields"><div>${select('month', 'Месяц', MONTHS.map((name, index) => [String(index + 1).padStart(2, '0'), name]), month.slice(5))}</div><div>${select('year', 'Год', years.map(value => [value, value]), year)}</div></div>` +
    field('comment', 'Комментарий', item?.comment || '', 'maxlength="1000"'), values => {
      const amount = Wealth.parseMoney(values.amount);
      if (!amount) throw Error('Доход должен быть больше нуля.');
      const record = {id: item?.id || uuid(), amount, category: values.category, month: `${values.year}-${values.month}`, comment: values.comment};
      mutate(next => {
        if (item) next.incomes[next.incomes.findIndex(row => row.id === id)] = record;
        else next.incomes.push(record);
      });
    });
}

function download(text, type, filename) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function exportCSV() {
  const cell = value => {
    const text = String(value);
    return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
  };
  const rows = [['Месяц', 'Год', 'Категория', 'Сумма, ₽', 'Комментарий'], ...[...portfolio.incomes].sort((a, b) => b.month.localeCompare(a.month)).map(item => [MONTHS[Number(item.month.slice(5)) - 1], item.month.slice(0, 4), item.category, editable(item.amount), item.comment])];
  download('\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8', 'personal-wealth-incomes.csv');
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const {action, id, kind} = target.dataset;
  try {
    if (action === 'new-item' || action === 'edit-item') itemEditor(kind, id);
    if (action === 'income' || action === 'edit-income') incomeEditor(id);
    if (action === 'delete-item' && ['assets', 'savings'].includes(kind) && confirm('Удалить «' + portfolio[kind].find(item => item.id === id)?.name + '»?')) mutate(next => { next[kind] = next[kind].filter(item => item.id !== id); });
    if (action === 'delete-income' && confirm('Удалить доход?')) mutate(next => { next.incomes = next.incomes.filter(item => item.id !== id); });
    if (action === 'period' && [6, 12, 24].includes(Number(id))) { period = Number(id); render(); }
    if (action === 'show-month') notify(`${monthLabel(id)}: ${money(Wealth.sum(portfolio.incomes.filter(item => item.month === id)))}`);
    if (action === 'export') download(storageError ? sourceText : JSON.stringify(portfolio, null, 2), 'application/json', 'personal-wealth.json');
    if (action === 'import') $('#import-file').click();
    if (action === 'csv') { if (storageError) throw Error('Сначала восстановите портфель.'); exportCSV(); }
  } catch (error) { notify(error.message); }
});
$('#add').onclick = () => location.hash === '#analytics' ? incomeEditor() : addMenu();
$('#close').onclick = () => $('#editor').close();
$('#form').onsubmit = event => {
  event.preventDefault();
  if (!editorSave) return;
  try {
    editorSave(Object.fromEntries(new FormData(event.target)));
    $('#editor').close();
    notify('Сохранено');
  } catch (error) { $('#error').textContent = error.message; }
};
document.addEventListener('change', async event => {
  if (event.target.id !== 'import-file') return;
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10000000) throw Error('Размер копии превышает 10 МБ.');
    const next = Wealth.migrate(JSON.parse((await file.text()).replace(/^\uFEFF/, '')), legacyCutoff());
    if (!confirm('Заменить текущий портфель резервной копией?')) return;
    localStorage.setItem(KEY, JSON.stringify(next));
    portfolio = next;
    storageError = '';
    sourceText = '';
    render();
    notify('Портфель восстановлен');
  } catch (error) { notify('Не удалось восстановить копию: ' + error.message); }
  finally { event.target.value = ''; }
});
window.addEventListener('hashchange', render);
window.addEventListener('storage', event => {
  if (event.key !== KEY || event.newValue === null) return;
  try { portfolio = Wealth.validate(JSON.parse(event.newValue)); storageError = ''; render(); }
  catch { notify('В другой вкладке сохранены некорректные данные. Обновите страницу.'); }
});
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
