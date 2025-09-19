const api = { expenses:'/api/admin-expenses' };
const els = {
  xTitle: document.getElementById('xTitle'),
  xPayee: document.getElementById('xPayee'),
  xPurpose: document.getElementById('xPurpose'),
  xAmount: document.getElementById('xAmount'),
  xWhen: document.getElementById('xWhen'),
  xAdd: document.getElementById('xAdd'),
  xTbl: document.getElementById('xTbl'),
  xMonth: document.getElementById('xMonth'),
  xApply: document.getElementById('xApply'),
  xTotal: document.getElementById('xTotal'),
  xCount: document.getElementById('xCount'),
  modal: document.getElementById('xModal'),
  eTitle: document.getElementById('eTitle'),
  ePayee: document.getElementById('ePayee'),
  ePurpose: document.getElementById('ePurpose'),
  eAmount: document.getElementById('eAmount'),
  eWhen: document.getElementById('eWhen'),
  eClose: document.getElementById('eClose'),
  eSave: document.getElementById('eSave'),
};
let editingId = null;

function openModal(it){
  editingId = it.id;
  els.modal.classList.add('show');
  els.eTitle.value = it.title||'';
  els.ePayee.value = it.payee||'';
  els.ePurpose.value = it.purpose||'';
  els.eAmount.value = it.amount||'';
  els.eWhen.value = (it.when||'').slice(0,16);
}
function closeModal(){ editingId=null; els.modal.classList.remove('show'); }

els.eClose.addEventListener('click', closeModal);

els.eSave.addEventListener('click', async () => {
  const payload = {
    title: els.eTitle.value.trim(),
    payee: els.ePayee.value.trim(),
    purpose: els.ePurpose.value.trim(),
    amount: (els.eAmount.value||'').trim() ? Number(els.eAmount.value) : undefined,
    when: els.eWhen.value ? els.eWhen.value : undefined,
  };
  const res = await fetch(`${api.expenses}/${editingId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Yenilənmədi');
  closeModal(); await loadExpenses();
});

els.xAdd.addEventListener('click', async () => {
  const payload = {
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
  els.xTitle.value = ''; els.xPayee.value = ''; els.xPurpose.value = ''; els.xAmount.value = ''; els.xWhen.value='';
  await loadExpenses();
});

function renderTable(items){
  els.xTbl.innerHTML = `<thead><tr>
    <th>Tarix</th><th>Xərc adı</th><th>Kimə</th><th>Nə üçün</th><th>Məbləğ (AZN)</th><th>Əməliyyat</th>
  </tr></thead>` + items.map(x => `
    <tr>
      <td>${(x.when||'').replace('T',' ').replace('Z','')}</td>
      <td>${x.title||''}</td>
      <td>${x.payee||''}</td>
      <td>${x.purpose||''}</td>
      <td><b>${(Number(x.amount)||0).toFixed(2)}</b></td>
      <td>
        <button class="btn" onclick='openModal(${JSON.stringify(x)})'>Redaktə</button>
        <button class="btn btn-danger" onclick='deleteExpense("${x.id}")'>Sil</button>
      </td>
    </tr>
  `).join('');
}

async function deleteExpense(id){
  if (!confirm('Xərci silmək istəyirsiniz?')) return;
  const res = await fetch(`${api.expenses}/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Silinmədi');
  await loadExpenses();
}

async function loadExpenses(){
  const q = (els.xMonth && els.xMonth.value) ? ('?month='+els.xMonth.value) : '';
  const res = await fetch(api.expenses + q);
  if (!res.ok) { document.getElementById('xTbl').innerHTML = '<tr><td colspan="6">API tapılmadı (404). Zəhmət olmazsa server versiyasını yeniləyin.</td></tr>'; return; }
  const data = await res.json();
  const items = data.items || [];
  els.xTotal.textContent = (data.total||0).toFixed(2) + ' AZN';
  els.xCount.textContent = items.length + ' ədəd xərc';
  renderTable(items);
}

// Default date-time now
(function initNow(){
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const v = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById('xWhen').value = v;
})();

loadExpenses();

els.xApply && els.xApply.addEventListener('click', loadExpenses);
