const api = { customers:'/api/customers' };
let editingId = null;

async function addCustomer() {
  const fd = new FormData();
  fd.append('firstName', document.getElementById('cFirst').value.trim());
  fd.append('lastName', document.getElementById('cLast').value.trim());
  fd.append('phone', document.getElementById('cPhone').value.trim());
  fd.append('email', document.getElementById('cEmail').value.trim());
  const file = document.getElementById('cIdCard').files[0];
  if (file) fd.append('idCard', file);
  const res = await fetch(api.customers, { method:'POST', body: fd });
  if (!res.ok) alert('Xəta: müştəri əlavə olunmadı');
  await loadCustomers();
}

function openEdit(c) {
  editingId = c.id;
  document.getElementById('eFirst').value = c.firstName||'';
  document.getElementById('eLast').value = c.lastName||'';
  document.getElementById('ePhone').value = c.phone||'';
  document.getElementById('eEmail').value = c.email||'';
  document.getElementById('custModal').classList.add('show');
}
function closeEdit(){ document.getElementById('custModal').classList.remove('show'); editingId=null; }

document.addEventListener('click', async (e) => {
  if (e.target.id === 'eClose') closeEdit();
  if (e.target.id === 'eSave') {
    const body = {
      firstName: document.getElementById('eFirst').value.trim(),
      lastName: document.getElementById('eLast').value.trim(),
      phone: document.getElementById('ePhone').value.trim(),
      email: document.getElementById('eEmail').value.trim()
    };
    const res = await fetch(`${api.customers}/${editingId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { alert('Yenilənmədi'); return; }
    closeEdit(); await loadCustomers();
  }
});

async function deleteCustomer(id){
  if (!confirm('Müştərini silmək istəyirsiniz? Aktiv rezervləri varsa silinməyəcək.')) return;
  const res = await fetch(`${api.customers}/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Silinmədi'); return; }
  await loadCustomers();
}

function renderCustomersTable(list=[]) {
  const el = document.getElementById('customersTbl');
  el.innerHTML = `<tr><th>Ad Soyad</th><th>Telefon</th><th>Email</th><th>ID</th><th>Əməliyyat</th></tr>` +
    list.map(x => `
      <tr>
        <td>${x.firstName} ${x.lastName}</td>
        <td>${x.phone||''}</td>
        <td>${x.email||''}</td>
        <td>${x.idCardPath ? `<a href="${x.idCardPath}" target="_blank">Bax</a>` : '-'}</td>
        <td>
          <button class="btn" onclick='openEdit(${JSON.stringify(x)})'>Redaktə</button>
          <button class="btn btn-danger" onclick='deleteCustomer("${x.id}")'>Sil</button>
        </td>
      </tr>
    `).join('');
}

async function loadCustomers() {
  const res = await fetch(api.customers);
  const data = await res.json();
  renderCustomersTable(data);
}
loadCustomers();
