/* ExpenseTrack – vanilla JS, LocalStorage persistence, Chart.js charts */
const KEY = 'expensetrack_data', INIT = 'expensetrack_init';
const CATS = {
  income: ['Salary', 'Freelance', 'Business', 'Investment', 'Other'],
  expense: ['Food', 'Transport', 'Shopping', 'Bills', 'Education', 'Entertainment', 'Healthcare', 'Travel', 'Other']
};
const COLORS = ['#6f4e37', '#c8a27c', '#3e2a1e', '#a67c52', '#d9c3a8', '#8d6e63', '#bcaaa4', '#5d4037', '#e0d5ca'];
const $ = s => document.querySelector(s);
let tx = [], charts = {}, editId = null, modalType = 'income';

/* ---------- Helpers ---------- */
const fmt = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fdate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (l, type) => l.filter(x => x.type === type).reduce((a, b) => a + b.amount, 0);
const mlabel = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
const save = () => localStorage.setItem(KEY, JSON.stringify(tx));

/** Group amounts of one type by category -> {category: total} */
function byCat(list, type) {
  const o = {};
  list.filter(x => x.type === type).forEach(x => o[x.category] = (o[x.category] || 0) + x.amount);
  return o;
}
/** Returns the last n month keys (YYYY-MM), oldest first */
function lastMonths(n) {
  const t = new Date(), a = [];
  for (let i = n - 1; i >= 0; i--) a.push(iso(new Date(t.getFullYear(), t.getMonth() - i, 1)).slice(0, 7));
  return a;
}
/** Creates a download in the browser from text */
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------- Data loading & sample data ---------- */
/** Builds demo transactions for the last 6 months (flagged sample:true) */
function sampleData() {
  const out = [], t = new Date(); let n = 1;
  const add = (m, day, type, title, category, amount, description) => {
    const d = new Date(t.getFullYear(), t.getMonth() - m, day);
    if (d > t) return;
    out.push({ id: 'TXN' + String(n++).padStart(4, '0'), type, title, category, amount, date: iso(d), description, sample: true });
  };
  for (let m = 5; m >= 0; m--) {
    add(m, 1, 'income', 'Monthly Salary', 'Salary', 55000, 'Salary credit');
    if (m % 2 === 0) add(m, 12, 'income', 'Website Project', 'Freelance', 12000 + m * 500, 'Client payment');
    add(m, 3, 'expense', 'Rent & Electricity', 'Bills', 14000, 'Monthly bills');
    add(m, 4, 'expense', 'Groceries', 'Food', 5200 + m * 150, 'Supermarket');
    add(m, 5, 'expense', 'Metro & Fuel', 'Transport', 2100, 'Commute');
    add(m, 8, 'expense', 'Online Shopping', 'Shopping', 3000 + m * 400, 'Clothes & accessories');
    add(m, 10, 'expense', 'Movie & Dining', 'Entertainment', 1800, 'Weekend out');
  }
  add(1, 15, 'expense', 'Online Course', 'Education', 4500, 'Certification');
  add(2, 9, 'expense', 'Doctor Visit', 'Healthcare', 1500, 'Health check-up');
  add(0, 2, 'income', 'Dividends', 'Investment', 3200, 'Quarterly dividend');
  return out;
}
function load() {
  if (!localStorage.getItem(INIT)) { // first visit: seed demo data once
    tx = sampleData(); localStorage.setItem(INIT, '1'); save();
  } else {
    try { tx = JSON.parse(localStorage.getItem(KEY)) || []; } catch { tx = []; }
  }
}
const nextId = () => 'TXN' + String(tx.reduce((m, x) => Math.max(m, parseInt(x.id.slice(3)) || 0), 0) + 1).padStart(4, '0');

/* ---------- Rendering: tables ---------- */
function row(t) {
  const sign = t.type === 'income' ? '+' : '-';
  return `<tr><td>${t.id}</td><td>${esc(t.title)}</td><td>${t.category}</td>
  <td><span class="badge ${t.type}">${t.type}</span></td><td class="${t.type}">${sign}${fmt(t.amount)}</td>
  <td>${fdate(t.date)}</td><td>${esc(t.description) || '—'}</td>
  <td style="white-space:nowrap"><button class="icon" title="Edit" onclick="openModal('${t.type}','${t.id}')"><i class="fa-solid fa-pen"></i></button>
  <button class="icon del" title="Delete" onclick="del('${t.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
}
function table(list) {
  if (!list.length) return '<div class="empty"><i class="fa-regular fa-folder-open"></i><p>No transactions found. Add one to get started.</p></div>';
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return `<div class="tw"><table><thead><tr><th>ID</th><th>Title</th><th>Category</th><th>Type</th><th>Amount</th><th>Date</th><th>Description</th><th>Actions</th></tr></thead><tbody>${sorted.map(row).join('')}</tbody></table></div>`;
}
/** Applies search + filters on the Transactions page */
function filtered() {
  const q = $('#fSearch').value.trim().toLowerCase(), ty = $('#fType').value, c = $('#fCat').value, m = $('#fMonth').value, d = $('#fDate').value;
  return tx.filter(x => (!ty || x.type === ty) && (!c || x.category === c) && (!m || x.date.startsWith(m)) && (!d || x.date === d) &&
    (!q || [x.id, x.title, x.description, x.category].join(' ').toLowerCase().includes(q)));
}

/* ---------- Rendering: charts ---------- */
function mk(id, type, data, extra = {}) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($('#' + id), {
    type, data,
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', display: type === 'doughnut' || !!extra.legend } },
      scales: type === 'doughnut' ? {} : { y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString('en-IN') } } } }
  });
}
const doughnut = (id, obj) => mk(id, 'doughnut', { labels: Object.keys(obj), datasets: [{ data: Object.values(obj), backgroundColor: COLORS }] });
function monthlyBars(id, months, withLegend) {
  mk(id, 'bar', { labels: months.map(mlabel), datasets: [
    { label: 'Income', data: months.map(m => sum(tx.filter(x => x.date.startsWith(m)), 'income')), backgroundColor: '#2e8b57', borderRadius: 6 },
    { label: 'Expenses', data: months.map(m => sum(tx.filter(x => x.date.startsWith(m)), 'expense')), backgroundColor: '#6f4e37', borderRadius: 6 }] }, { legend: true });
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const inc = sum(tx, 'income'), exp = sum(tx, 'expense'), cur = iso(new Date()).slice(0, 7);
  const monthTx = tx.filter(x => x.date.startsWith(cur)), sav = sum(monthTx, 'income') - sum(monthTx, 'expense');
  $('#sBalance').textContent = fmt(inc - exp); $('#sIncome').textContent = fmt(inc); $('#sExpense').textContent = fmt(exp);
  $('#sSavings').textContent = fmt(sav); $('#sSavings').className = sav >= 0 ? 'income' : 'expense';
  const months = lastMonths(6);
  monthlyBars('cIE', months);
  mk('cSpend', 'line', { labels: months.map(mlabel), datasets: [{ label: 'Spending', data: months.map(m => sum(tx.filter(x => x.date.startsWith(m)), 'expense')), borderColor: '#6f4e37', backgroundColor: 'rgba(200,162,124,.3)', fill: true, tension: .35 }] });
  doughnut('cCat', byCat(tx, 'expense'));
  const recent = [...tx].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5);
  $('#recent').innerHTML = recent.length ? recent.map(t => `<div class="recent"><div><b>${esc(t.title)}</b><small>${t.category} · ${fdate(t.date)}</small></div><b class="${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</b></div>`).join('')
    : '<div class="empty"><i class="fa-regular fa-folder-open"></i><p>No transactions yet.</p></div>';
}

/* ---------- Analytics & report ---------- */
function renderAnalytics() {
  if (!$('#aMonth').value) $('#aMonth').value = iso(new Date()).slice(0, 7);
  const m = $('#aMonth').value, list = tx.filter(x => x.date.startsWith(m));
  const inc = sum(list, 'income'), exp = sum(list, 'expense'), sav = inc - exp;
  $('#aInc').textContent = fmt(inc); $('#aExp').textContent = fmt(exp);
  $('#aSav').textContent = fmt(sav); $('#aSav').className = sav >= 0 ? 'income' : 'expense';
  $('#aRate').textContent = inc ? (sav / inc * 100).toFixed(1) + '%' : '0%';
  const cats = byCat(list, 'expense');
  doughnut('aCat', cats); doughnut('aInCat', byCat(list, 'income')); monthlyBars('aCmp', lastMonths(6));
  const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  $('#aTable').innerHTML = rows.length ? `<table><thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead><tbody>${rows.map(([c, v]) => `<tr><td>${c}</td><td>${fmt(v)}</td><td>${(v / exp * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty"><i class="fa-regular fa-folder-open"></i><p>No expenses in this month.</p></div>';
}
function downloadReport() {
  const m = $('#aMonth').value, list = tx.filter(x => x.date.startsWith(m));
  const inc = sum(list, 'income'), exp = sum(list, 'expense'), cats = byCat(list, 'expense');
  let t = `EXPENSETRACK MONTHLY REPORT - ${mlabel(m)}\n${'='.repeat(40)}\nTotal Income : ${fmt(inc)}\nTotal Expense: ${fmt(exp)}\nSavings      : ${fmt(inc - exp)}\n\nEXPENSES BY CATEGORY\n`;
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => t += `${c.padEnd(15)} ${fmt(v)} (${(v / exp * 100).toFixed(1)}%)\n`);
  t += '\nTRANSACTIONS\n' + list.sort((a, b) => a.date.localeCompare(b.date)).map(x => `${x.date}  ${x.type.padEnd(8)} ${x.category.padEnd(14)} ${fmt(x.amount)}  ${x.title}`).join('\n');
  download(`ExpenseTrack_Report_${m}.txt`, t, 'text/plain');
}

/* ---------- Render everything ---------- */
function renderAll() {
  renderDashboard();
  $('#incomeList').innerHTML = table(tx.filter(x => x.type === 'income'));
  $('#expenseList').innerHTML = table(tx.filter(x => x.type === 'expense'));
  $('#txList').innerHTML = table(filtered());
  renderAnalytics();
}

/* ---------- Add / edit / delete ---------- */
/** Opens the modal for a new entry, or for editing when id is given */
function openModal(type, id = null) {
  modalType = type; editId = id; $('#err').textContent = '';
  $('#category').innerHTML = CATS[type].map(c => `<option>${c}</option>`).join('');
  const t = id ? tx.find(x => x.id === id) : null;
  $('#mTitle').textContent = (t ? 'Edit ' : 'Add ') + (type === 'income' ? 'Income' : 'Expense');
  $('#title').value = t ? t.title : ''; $('#category').value = t ? t.category : CATS[type][0];
  $('#amount').value = t ? t.amount : ''; $('#date').value = t ? t.date : iso(new Date()); $('#desc').value = t ? t.description : '';
  $('#modal').classList.add('open');
}
const closeModal = () => $('#modal').classList.remove('open');
/** Validates form, then creates or updates the transaction */
function submitForm(e) {
  e.preventDefault();
  const title = $('#title').value.trim(), amount = parseFloat($('#amount').value), date = $('#date').value;
  if (title.length < 2) return $('#err').textContent = 'Please enter a title (min 2 characters).';
  if (!(amount > 0)) return $('#err').textContent = 'Amount must be greater than zero.';
  if (!date) return $('#err').textContent = 'Please select a date.';
  const data = { type: modalType, title, category: $('#category').value, amount: Math.round(amount * 100) / 100, date, description: $('#desc').value.trim() };
  if (editId) { const i = tx.findIndex(x => x.id === editId); tx[i] = { ...tx[i], ...data }; }
  else tx.push({ id: nextId(), ...data });
  save(); closeModal(); renderAll();
}
function del(id) {
  if (confirm('Delete this transaction? This cannot be undone.')) { tx = tx.filter(x => x.id !== id); save(); renderAll(); }
}

/* ---------- Navigation & events ---------- */
function show(p) {
  document.querySelectorAll('.page').forEach(s => s.classList.toggle('active', s.id === p));
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  $('#pageTitle').textContent = document.querySelector(`.nav[data-page="${p}"]`).textContent;
  $('#sidebar').classList.remove('open'); renderAll();
}
function init() {
  load();
  $('#fCat').innerHTML += [...new Set([...CATS.income, ...CATS.expense])].map(c => `<option>${c}</option>`).join('');
  document.querySelectorAll('.nav').forEach(b => b.onclick = () => show(b.dataset.page));
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#form').onsubmit = submitForm; $('#cancel').onclick = closeModal;
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  ['fSearch', 'fType', 'fCat', 'fMonth', 'fDate'].forEach(i => $('#' + i).oninput = () => $('#txList').innerHTML = table(filtered()));
  $('#fReset').onclick = () => { ['fSearch', 'fType', 'fCat', 'fMonth', 'fDate'].forEach(i => $('#' + i).value = ''); $('#txList').innerHTML = table(filtered()); };
  $('#aMonth').oninput = renderAnalytics; $('#dlReport').onclick = downloadReport;
  $('#exportCsv').onclick = () => {
    if (!tx.length) return alert('No transactions to export.');
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    download('ExpenseTrack_transactions.csv', ['ID,Title,Category,Type,Amount,Date,Description', ...tx.map(x => [x.id, x.title, x.category, x.type, x.amount, x.date, x.description].map(q).join(','))].join('\n'));
  };
  $('#rmSample').onclick = () => {
    if (!tx.some(x => x.sample)) return alert('There is no sample data to remove.');
    if (confirm('Remove all sample transactions? Your own entries are kept.')) { tx = tx.filter(x => !x.sample); save(); renderAll(); }
  };
  $('#clearAll').onclick = () => { if (confirm('Delete ALL transactions permanently?')) { tx = []; save(); renderAll(); } };
  renderAll();
}
document.addEventListener('DOMContentLoaded', init);
