const api = {
  cars: '/api/cars',
  customers: '/api/customers',
  reservations: '/api/reservations',
  accounting: '/api/accounting/summary'
};

const L = { car:{ FREE:'Bron üçün uyğundur', RESERVED:'Brondadır', IN_USE:'İstifadədədir', SERVICE:'Təmir/Texniki xidmət', BLOCKED:'Bloklanıb' }, res:{ BOOKED:'Brondadır', ACTIVE:'İstifadədədir', COMPLETED:'Bitdi', CANCELED:'Ləğv edilib' } };

const els = {
  rCar: document.getElementById('rCar'),
  rCustomer: document.getElementById('rCustomer'),
  rStart: document.getElementById('rStart'),
  rEnd: document.getElementById('rEnd'),
  rDiscount: document.getElementById('rDiscount'),
  rTotal: document.getElementById('rTotal'),
  rUnitPrice: document.getElementById('rUnitPrice'),
  rDestination: document.getElementById('rDestination'),
  reservationsTbl: document.getElementById('reservationsTbl'),
  btnCreate: document.getElementById('btnCreate'),
  btnSearch: document.getElementById('btnSearch'),
  customerSearch: document.getElementById('customerSearch'),
  btnNewCustomer: document.getElementById('btnNewCustomer'),
  modal: document.getElementById('custModal'),
  mClose: document.getElementById('mClose'),
  mSave: document.getElementById('mSave'),
  mFirst: document.getElementById('mFirst'),
  mLast: document.getElementById('mLast'),
  mPhone: document.getElementById('mPhone'),
  mEmail: document.getElementById('mEmail'),
  mIdCard: document.getElementById('mIdCard'),

  resModal: document.getElementById('resModal'),
  resClose: document.getElementById('resClose'),
  resSave: document.getElementById('resSave'),
  eCar: document.getElementById('eCar'),
  eCustomer: document.getElementById('eCustomer'),
  eStart: document.getElementById('eStart'),
  eEnd: document.getElementById('eEnd'),
  eDiscount: document.getElementById('eDiscount'),
  eStatus: document.getElementById('eStatus'),
};

function openModal(){ els.modal.classList.add('show'); }
function closeModal(){ els.modal.classList.remove('show'); }
function openResModal(){ els.resModal.classList.add('show'); }
function closeResModal(){ els.resModal.classList.remove('show'); }

els.mClose.addEventListener('click', closeModal);
els.btnNewCustomer.addEventListener('click', openModal);

els.mSave.addEventListener('click', async () => {
  const fd = new FormData();
  fd.append('firstName', els.mFirst.value.trim());
  fd.append('lastName', els.mLast.value.trim());
  fd.append('phone', els.mPhone.value.trim());
  fd.append('email', els.mEmail.value.trim());
  const file = els.mIdCard.files[0];
  if (file) fd.append('idCard', file);
  const res = await fetch(api.customers, { method:'POST', body: fd });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Müştəri əlavə edilə bilmədi'); return; }
  await loadCustomers();
  els.rCustomer.value = data.id;
  closeModal();
});

els.btnSearch.addEventListener('click', async () => {
  await loadCustomers(els.customerSearch.value.trim());
});

['rCar','rStart','rEnd','rDiscount','rUnitPrice'].forEach(id => {
  document.getElementById(id).addEventListener('change', updatePreviewTotal);
});

async function checkConflictPreview(excludeId=null){
  const carId = els.rCar.value;
  const startAt = els.rStart.value;
  const endAt = els.rEnd.value;
  const warn = document.getElementById('conflictWarn');
  if (!carId || !startAt || !endAt) { warn.textContent=''; els.btnCreate.disabled=false; return; }
  const res = await fetch('/api/reservations/check', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ carId, startAt, endAt, excludeId }) });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    warn.textContent = (data && data.error) ? '⚠️ ' + data.error : '⚠️ Uyğun deyil: tarix çakışması';
    els.btnCreate.disabled = true;
  } else {
    warn.textContent = 'Bron üçün uyğundur.';
    els.btnCreate.disabled = false;
  }
}

async function updatePreviewTotal(){
  const carId = els.rCar.value;
  const start = els.rStart.value;
  const end = els.rEnd.value;
  const discount = Number(els.rDiscount.value || 0);
  if (!carId || !start || !end) { await checkConflictPreview(); return; }
  const cars = await (await fetch(api.cars)).json();
  const car = cars.find(c=>c.id===carId);
  if (!car) return;
  const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / (1000*60*60*24)));
  const unit = els.rUnitPrice.value ? Number(els.rUnitPrice.value) : (car.basePricePerDay||0);
  let gross = unit * days;
  if (discount>0) gross = gross * (1 - discount/100);
  els.rTotal.value = gross.toFixed(2) + ' AZN';
  await checkConflictPreview();
}

els.btnCreate.addEventListener('click', async () => {
  const payload = {
    carId: els.rCar.value,
    customerId: els.rCustomer.value,
    startAt: els.rStart.value,
    endAt: els.rEnd.value,
    discountPercent: Number(els.rDiscount.value || 0),
    pricePerDay: els.rUnitPrice.value ? Number(els.rUnitPrice.value) : undefined,
    destination: els.rDestination.value || ''
  };
  const res = await fetch(api.reservations, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { alert(data.error || ('Xəta: ' + res.status)); return; }
  await loadReservations();
  await loadCars();
});

let editingResId = null;

function renderReservationsTable(list=[]) {
  els.reservationsTbl.innerHTML = `<tr><th>Müştəri</th><th>Maşın</th><th>Götürmə</th><th>Qaytarma</th><th>Gün</th><th>Qiymət/gün</th><th>Endirim</th><th>Cəmi</th><th>İstiqamət</th><th>Status</th><th>Əməliyyat</th></tr>` +
    list.map(r => `
      <tr>
        <td>${(r.customer && (r.customer.firstName+" "+r.customer.lastName)) || r.customerId}</td>
        <td>${(r.car && (r.car.brand+" "+r.car.model+" ("+r.car.plate+")")) || r.carId}</td>
        <td>${fmt(r.startAt)}</td><td>${fmt(r.endAt)}</td>
        <td>${r.days}</td>
        <td>${r.pricePerDay}</td>
        <td>${r.discountPercent}%</td>
        <td><b>${r.totalPrice}</b></td>
        <td>${r.destination||''}</td>
        <td><span class="pill">${L.res[r.status]||r.status}</span></td>
        <td>
          <button class="btn" onclick='openResEdit(${JSON.stringify({id:r.id,carId:r.carId,customerId:r.customerId,startAt:r.startAt,endAt:r.endAt,discountPercent:r.discountPercent,status:r.status})})'>Redaktə</button>
          <button class="btn btn-danger" onclick='deleteReservation("${r.id}")'>Sil</button>
        </td>
      </tr>
    `).join('');
}

async function openResEdit(r) {
  editingResId = r.id;
  const [cars, customers] = await Promise.all([ (await fetch(api.cars)).json(), (await fetch(api.customers)).json() ]);
  els.eCar.innerHTML = cars.map(c => `<option value="${c.id}">${c.brand} ${c.model} (${c.plate})</option>`).join('');
  els.eCustomer.innerHTML = customers.map(c => `<option value="${c.id}">${c.firstName} ${c.lastName}</option>`).join('');
  els.eCar.value = r.carId;
  els.eCustomer.value = r.customerId;
  els.eStart.value = r.startAt;
  els.eEnd.value = r.endAt;
  els.eDiscount.value = r.discountPercent||0;
  const __eu = document.getElementById('eUnitPrice'); if (__eu) __eu.value = r.pricePerDay||'';
  const __ed = document.getElementById('eDestination'); if (__ed) __ed.value = r.destination||'';
  els.eStatus.value = r.status;
  openResModal();
}

els.resClose.addEventListener('click', closeResModal);
els.resSave.addEventListener('click', async () => {
  const payload = {
    carId: els.eCar.value,
    customerId: els.eCustomer.value,
    startAt: els.eStart.value,
    endAt: els.eEnd.value,
    discountPercent: Number(els.eDiscount.value||0),
    pricePerDay: (document.getElementById('eUnitPrice') && (document.getElementById('eUnitPrice').value||'').trim()) ? Number(document.getElementById('eUnitPrice').value) : undefined,
    destination: document.getElementById('eDestination') ? document.getElementById('eDestination').value : '',
    status: els.eStatus.value
  };
  const res = await fetch(`${api.reservations}/${editingResId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Yenilənmədi'); return; }
  closeResModal(); await loadReservations(); await loadCars();
});

async function deleteReservation(id){
  if (!confirm('Rezervi silmək istəyirsiniz?')) return;
  const res = await fetch(`${api.reservations}/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Silinmədi'); return; }
  await loadReservations(); await loadCars();
}

async function loadCars() {
  const res = await fetch(api.cars); const data = await res.json();
  els.rCar.innerHTML = data.filter(c=>c.status==='FREE').map(c => `<option value="${c.id}">${c.brand} ${c.model} (${c.plate}) — ${c.basePricePerDay} AZN</option>`).join('');
}

async function loadCustomers(q="") {
  const url = q ? `${api.customers}?q=${encodeURIComponent(q)}` : api.customers;
  const data = await (await fetch(url)).json();
  els.rCustomer.innerHTML = data.map(c => `<option value="${c.id}">${c.firstName} ${c.lastName}${c.phone? " — "+c.phone:""}</option>`).join('');
}

async function loadReservations() {
  const [rRes, cRes, uRes] = await Promise.all([
    fetch(api.reservations), fetch(api.cars), fetch(api.customers)
  ]);
  const [resvs, cars, customers] = await Promise.all([rRes.json(), cRes.json(), uRes.json()]);
  const list = resvs.map(r => ({
    ...r,
    car: cars.find(c=>c.id===r.carId),
    customer: customers.find(u=>u.id===r.customerId)
  }));
  renderReservationsTable(list);
}

async function boot(){
  await loadCars();
  await loadCustomers();
  await loadReservations();
}
boot();


['eCar','eStart','eEnd'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', async () => {
    const warn = document.getElementById('eConflictWarn');
    const carId = document.getElementById('eCar').value;
    const startAt = document.getElementById('eStart').value;
    const endAt = document.getElementById('eEnd').value;
    if (!carId || !startAt || !endAt) { warn.textContent=''; return; }
    const res = await fetch('/api/reservations/check', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ carId, startAt, endAt, excludeId: editingResId }) });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      warn.textContent = (data && data.error) ? '⚠️ ' + data.error : '⚠️ Tarix çakışması tapıldı';
    } else {
      warn.textContent = 'Bron üçün uyğundur.';
    }
  });
});

function fmt(dt){ try { return new Date(dt).toLocaleString(); } catch(e){ return dt; } }
