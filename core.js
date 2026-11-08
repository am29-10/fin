(function (root) {
  'use strict';
  const MAX = 99999999999999;
  const TYPES = {
    asset: ['Недвижимость', 'Автомобиль', 'Инвестиции', 'Другое'],
    savings: ['Банковский счёт', 'Вклад', 'Наличные', 'Другое'],
    income: ['Зарплата', 'Аренда', 'Дивиденды', 'Проценты', 'Другое']
  };

  function parseMoney(text) {
    const value = String(text).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(value)) throw Error('Введите сумму с точностью до двух знаков после запятой.');
    const [whole, fraction = ''] = value.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (minor > BigInt(MAX)) throw Error('Максимальная сумма — 999 999 999 999,99 ₽.');
    return Number(minor);
  }

  function monthIndex(month) {
    if (typeof month !== 'string' || !/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(month)) {
      throw Error('Выберите корректные месяц и год.');
    }
    const [year, number] = month.split('-').map(Number);
    return year * 12 + number - 1;
  }

  function shiftMonth(month, offset) {
    const index = monthIndex(month) + offset;
    return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
  }

  const sum = rows => rows.reduce((value, item) => value + BigInt(item.amount), 0n);
  const total = portfolio => sum(portfolio.assets) + sum(portfolio.savings);
  const incomesFor = (portfolio, month, count) => {
    const end = monthIndex(month);
    return portfolio.incomes.filter(item => {
      const index = monthIndex(item.month);
      return index <= end && index > end - count;
    });
  };

  function validate(portfolio) {
    if (!portfolio || portfolio.version !== 2) throw Error('Неизвестный формат резервной копии.');
    const ids = new Set();
    const text = (value, max = 1000) => typeof value === 'string' && value.length <= max;
    const amount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX;
    const result = {version: 2, assets: [], savings: [], incomes: []};
    for (const kind of ['assets', 'savings', 'incomes']) {
      if (!Array.isArray(portfolio[kind]) || portfolio[kind].length > 10000) throw Error('Повреждённый список записей.');
      for (const item of portfolio[kind]) {
        if (!item || !text(item.id, 120) || !item.id || ids.has(item.id) || !amount(item.amount)) {
          throw Error('Некорректная сумма или повторяющийся идентификатор.');
        }
        ids.add(item.id);
        if (kind === 'incomes') {
          monthIndex(item.month);
          if (item.amount === 0 || !text(item.category, 120) || !item.category.trim() || !text(item.comment)) {
            throw Error('Проверьте данные дохода.');
          }
          result.incomes.push({id: item.id, amount: item.amount, category: item.category.trim(), month: item.month, comment: item.comment});
        } else {
          if (!text(item.name, 120) || !item.name.trim() || !text(item.type, 120) || !item.type.trim() || !text(item.notes)) {
            throw Error('Проверьте название и тип объекта.');
          }
          result[kind].push({id: item.id, name: item.name.trim(), type: item.type.trim(), amount: item.amount, notes: item.notes});
        }
      }
    }
    return result;
  }

  // Read the previous local web format once; keep its original storage untouched.
  function migrate(source, cutoff) {
    if (source?.version === 2) return validate(source);
    if (!source || source.version !== 1) throw Error('Неизвестный формат резервной копии.');
    if (source.currency !== 'RUB') throw Error('Старая копия не в рублях. Автоматическая конвертация недоступна.');
    for (const key of ['catalogs', 'assets', 'savings', 'valuations', 'balances', 'incomes']) {
      if (!Array.isArray(source[key]) || source[key].length > 100000) throw Error('Повреждённая старая копия.');
    }
    const name = id => source.catalogs.find(item => item.id === id)?.name || 'Другое';
    const current = (rows, owner) => rows.filter(item => item.owner === owner && typeof item.date === 'string' && item.date <= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order)[0]?.amount ?? 0;
    return validate({
      version: 2,
      assets: source.assets.map(item => ({id: item.id, name: item.name, type: name(item.type), amount: current(source.valuations, item.id), notes: item.notes || ''})),
      savings: source.savings.map(item => ({id: item.id, name: item.name, type: name(item.type), amount: current(source.balances, item.id), notes: item.notes || ''})),
      incomes: source.incomes.map(item => ({id: item.id, amount: item.amount, category: name(item.category), month: typeof item.date === 'string' ? item.date.slice(0, 7) : '', comment: item.comment || ''}))
    });
  }

  const api = {TYPES, parseMoney, monthIndex, shiftMonth, sum, total, incomesFor, validate, migrate};
  root.Wealth = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
