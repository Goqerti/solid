const api = { cars:'/api/cars', expenses:'/api/car-expenses' };
const els = {
  carSelect: document.getElementById('carSelect'),
  xMonth: document.getElementById('xMonth'),
  xApply: document.getElementById('xApply'),
  xTbl: document.getElementById('xTbl'),
  xTitle: document.getElementById('xTitle'),
  xPayee: document.getElementById('xPayee'),
  xPurpose: document.getElementById('xPurpose'),
  xAmount: document.getElementById('xAmount'),
  xWhen: document.getElementById('xWhen'),
  xAdd: document.getElementById('xAdd'),
  xTotal: document.getElementById('xTotal'),
  xCount: document.getElementById('xCount'),
  modal: document.getElementById('cxModal'),
  ceTitle: document.getElementById('ceTitle'),
  cePayee: document.getElementById('cePayee'),
  cePurpose: document.getElementById('cePurpose'),
  ceAmount: document.getElementById('ceAmount'),
  ceWhen: document.getElementById('ceWhen'),
  ceClose: document.getElementById('ceClose'),
  ceSave: document.getElementById('ceSave')
};

function getQueryParam(k){
  const p = new URLSearchParams(location.search);
  return p.get(k);
}

async function loadCars(selectedId){
  const res = await fetch(api.cars); const cars = await res.json();
  els.carSelect.innerHTML = '<option value="">— Seçin —</option>' + cars.map(c => `<option value="${c.id}">${c.plate||'-'} — ${c.brand} ${c.model}</option>`).join('');
  const q = getQueryParam('carId');
  els.carSelect.value = selectedId || q || '';
}

function renderTable(items){
  // renders table with edit/delete buttons
  els.xTbl.innerHTML = `<thead><tr>
    <th>Tarix</th><th>Xərc adı</th><th>Kimə</th><th>Nə üçün</th><th>Məbləğ (AZN)</th><th>Əməliyyat</th>
  </tr></thead>` + items.map(x => `
    <tr>
      <td>${(x.when||'').replace('T',' ').replace('Z','')}</td>
      <td>${x.title||''}</td>
      <td>${x.payee||''}</td>
      <td>${x.purpose||''}</td>
      <td><b>${Number(x.amount||0).toFixed(2)}</b></td>
      <td>
        <button class='btn' onclick='openCarModal(${JSON.stringify(x)})'>Redaktə</button>
        <button class='btn btn-danger' onclick='deleteCarExpense("${x.id}")'>Sil</button>
      </td>
      <td>
        <button class=\"btn\" onclick='openEdit(${JSON.stringify(x)})'>Redaktə</button>
        <button class=\"btn btn-danger\" onclick='deleteExpense(\"${x.id}\")'>Sil</button>
      </td>
    </tr>`).join('');
}

async function loadExpenses(){
  const carId = els.carSelect.value;
  if (!carId) { els.xTbl.innerHTML = ''; els.xTotal.textContent = '0.00 AZN'; els.xCount.textContent=''; return; }
  const month = els.xMonth.value;
  const url = new URL(api.expenses, location.origin);
  if (month) url.searchParams.set('month', month);
  if (carId) url.searchParams.set('carId', carId);
  const res = await fetch(url); const data = await res.json();
  renderTable(data.items||[]);
  els.xTotal.textContent = `${Number(data.total||0).toFixed(2)} AZN`;
  els.xCount.textContent = `${data.count||0} xərc`;
}

els.xAdd.addEventListener('click', async () => {
  const carId = els.carSelect.value;
  if (!carId) return alert('Əvvəl maşın seçin');
  const payload = {
    carId,
    title: els.xTitle.value.trim(),
    payee: els.xPayee.value.trim(),
    purpose: els.xPurpose.value.trim(),
    amount: Number(els.xAmount.value || 0),
    when: els.xWhen.value || null
  };
  if (!payload.title || !(payload.amount>0)) return alert('Xərc adı və məbləğ düzgün doldurulmalıdır');
  const res = await fetch(api.expenses, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Əlavə olunmadı');
  els.xTitle.value = ''; els.xPayee.value = ''; els.xPurpose.value = ''; els.xAmount.value = ''; // keep when
  await loadExpenses();
});

function setDefaultMonth(){
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  els.xMonth.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  const v = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  els.xWhen.value = v;
}

function init(){
  setDefaultMonth();
  loadCars();
  loadExpenses();
  els.xApply.addEventListener('click', loadExpenses);
  els.carSelect.addEventListener('change', loadExpenses);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

let editingId = null;

function openCarModal(it){
  editingId = it.id;
  const title = prompt('Xərc adı', it.title||'');
  if (title===null) return;
  const payee = prompt('Kimə', it.payee||'');
  if (payee===null) return;
  const purpose = prompt('Nə üçün', it.purpose||'');
  if (purpose===null) return;
  const amount = prompt('Məbləğ', it.amount||0);
  if (amount===null) return;
  const payload = { title, payee, purpose, amount:Number(amount) };
  fetch(api.expenses + '/' + editingId, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
    .then(r=>r.json()).then(d=>loadExpenses());
}

function deleteCarExpense(id){
  if (!confirm('Silinsin?')) return;
  fetch(api.expenses + '/' + id, { method:'DELETE' })
    .then(r=>r.json()).then(d=>loadExpenses());
}

function openEdit(item){
  editingId = item.id;
  els.ceTitle.value = item.title || '';
  els.cePayee.value = item.payee || '';
  els.cePurpose.value = item.purpose || '';
  els.ceAmount.value = Number(item.amount||0);
  const when = (item.when||'').replace('Z','').replace(' ','T');
  els.ceWhen.value = when;
  els.modal.classList.add('show');
}

function closeModal(){
  editingId = null;
  els.modal.classList.remove('show');
}
els.ceClose && els.ceClose.addEventListener('click', closeModal);

els.ceSave && els.ceSave.addEventListener('click', async () => {
  if (!editingId) return;
  const payload = {
    title: els.ceTitle.value.trim(),
    payee: els.cePayee.value.trim(),
    purpose: els.cePurpose.value.trim(),
    amount: Number(els.ceAmount.value || 0),
    when: els.ceWhen.value ? els.ceWhen.value : undefined,
    carId: els.carSelect.value || undefined
  };
  const res = await fetch(`${api.expenses}/${editingId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Yenilənmədi');
  closeModal(); await loadExpenses();
});

async function deleteExpense(id){
  if (!confirm('Silmək istədiyinizə əminsiniz?')) return;
  const res = await fetch(`${api.expenses}/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Silinmədi');
  await loadExpenses();
}
