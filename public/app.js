const api = {
  cars: '/api/cars',
  customers: '/api/customers',
  reservations: '/api/reservations',
  accounting: '/api/accounting/summary'
};

async function addCar() {
  const body = {
    brand: document.getElementById('carBrand').value.trim(),
    model: document.getElementById('carModel').value.trim(),
    year: document.getElementById('carYear').value,
    plate: document.getElementById('carPlate').value.trim(),
    vin: document.getElementById('carVin').value.trim(),
    basePricePerDay: document.getElementById('carPrice').value
  };
  const res = await fetch(api.cars, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) alert('Xəta: maşın əlavə olunmadı');
  await loadCars();
}

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

async function createReservation() {
  const carId = document.getElementById('rCar').value;
  const customerId = document.getElementById('rCustomer').value;
  const startDate = document.getElementById('rStart').value;
  const endDate = document.getElementById('rEnd').value;
  const discountPercent = Number(document.getElementById('rDiscount').value || 0);

  const res = await fetch(api.reservations, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ carId, customerId, startDate, endDate, discountPercent }) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Xəta');
  await loadReservations();
  await loadCars();
}

function renderCarsTable(cars=[]) {
  const el = document.getElementById('carsTbl');
  el.innerHTML = `<tr><th>Marka/Model</th><th>Nömrə</th><th>Günlük AZN</th><th>Status</th><th>Hərəkət</th></tr>` +
    cars.map(c => `
      <tr>
        <td>${c.brand} ${c.model}</td>
        <td>${c.plate}</td>
        <td>${c.basePricePerDay||0}</td>
        <td><span class="pill">${c.status}</span></td>
        <td>
          <select id="st-${c.id}">
            <option>FREE</option>
            <option>RESERVED</option>
            <option>IN_USE</option>
            <option>SERVICE</option>
            <option>BLOCKED</option>
          </select>
          <button onclick="updateCarStatus('${c.id}')">Yenilə</button>
        </td>
      </tr>
    `).join('');
}

async function updateCarStatus(id) {
  const status = document.getElementById(`st-${id}`).value;
  const res = await fetch(`/api/cars/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) });
  if (!res.ok) alert('Status yenilənmədi');
  await loadCars();
}

function renderCustomersTable(list=[]) {
  const el = document.getElementById('customersTbl');
  el.innerHTML = `<tr><th>Ad Soyad</th><th>Telefon</th><th>ID</th></tr>` +
    list.map(x => `
      <tr>
        <td>${x.firstName} ${x.lastName}</td>
        <td>${x.phone||''}</td>
        <td>${x.idCardPath ? `<a href="${x.idCardPath}" target="_blank">Bax</a>` : '-'}</td>
      </tr>
    `).join('');
}

function renderReservationsTable(list=[]) {
  const el = document.getElementById('reservationsTbl');
  el.innerHTML = `<tr><th>Müştəri</th><th>Maşın</th><th>Tarix</th><th>Gün</th><th>Qiymət/gün</th><th>Endirim</th><th>Cəmi</th><th>Status</th><th>Hərəkət</th></tr>` +
    list.map(r => `
      <tr>
        <td>${(r.customer && (r.customer.firstName+" "+r.customer.lastName)) || r.customerId}</td>
        <td>${(r.car && (r.car.brand+" "+r.car.model+" ("+r.car.plate+")")) || r.carId}</td>
        <td>${r.startDate} → ${r.endDate}</td>
        <td>${r.days}</td>
        <td>${r.pricePerDay}</td>
        <td>${r.discountPercent}%</td>
        <td><b>${r.totalPrice}</b></td>
        <td><span class="pill">${r.status}</span></td>
        <td>
          <select id="rst-${r.id}">
            <option>BOOKED</option>
            <option>ACTIVE</option>
            <option>COMPLETED</option>
            <option>CANCELED</option>
          </select>
          <button onclick="updateReservationStatus('${r.id}')">Yenilə</button>
        </td>
      </tr>
    `).join('');
}

async function updateReservationStatus(id) {
  const status = document.getElementById(`rst-${id}`).value;
  const res = await fetch(`/api/reservations/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) });
  if (!res.ok) alert('Rezerv statusu yenilənmədi');
  await loadReservations();
  await loadCars();
}

async function loadCars() {
  const res = await fetch(api.cars); const data = await res.json();
  renderCarsTable(data);
  const sel = document.getElementById('rCar');
  sel.innerHTML = data.filter(c=>c.status==='FREE').map(c => `<option value="${c.id}">${c.brand} ${c.model} (${c.plate}) — ${c.basePricePerDay} AZN</option>`).join('');
}

async function loadCustomers() {
  const res = await fetch(api.customers); const data = await res.json();
  renderCustomersTable(data);
  const sel = document.getElementById('rCustomer');
  sel.innerHTML = data.map(c => `<option value="${c.id}">${c.firstName} ${c.lastName}</option>`).join('');
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

async function loadRevenue() {
  const res = await fetch(api.accounting); const data = await res.json();
  document.getElementById('revenueBox').innerHTML = `<h3>Cəmi gəlir: ${data.totalRevenue} AZN</h3><small class="muted">Rezerv sayı: ${data.count}</small>`;
}

// Auto total price preview
['rCar','rStart','rEnd','rDiscount'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', async () => {
    const carId = document.getElementById('rCar').value;
    const start = document.getElementById('rStart').value;
    const end = document.getElementById('rEnd').value;
    const discount = Number(document.getElementById('rDiscount').value || 0);
    if (!carId || !start || !end) return;
    const cars = await (await fetch(api.cars)).json();
    const car = cars.find(c=>c.id===carId);
    if (!car) return;
    const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / (1000*60*60*24)));
    let gross = (car.basePricePerDay||0) * days;
    if (discount>0) gross = gross * (1 - discount/100);
    document.getElementById('rTotal').value = gross.toFixed(2) + ' AZN';
  });
});

async function boot() {
  await loadCars();
  await loadCustomers();
  await loadReservations();
  await loadRevenue();
}

boot();
