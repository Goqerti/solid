const api = { cars:'/api/cars' };
const L = { FREE:'Bron üçün uyğundur', RESERVED:'Brondadır', IN_USE:'İstifadədədir', SERVICE:'Təmir/Texniki xidmət', BLOCKED:'Bloklanıb' };
let editingId = null;

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

function openEdit(car){
  editingId = car.id;
  document.getElementById('eBrand').value = car.brand||'';
  document.getElementById('eModel').value = car.model||'';
  document.getElementById('eYear').value = car.year||'';
  document.getElementById('ePlate').value = car.plate||'';
  document.getElementById('eVin').value = car.vin||'';
  document.getElementById('ePrice').value = car.basePricePerDay||0;
  document.getElementById('carModal').classList.add('show');
}
function closeEdit(){ document.getElementById('carModal').classList.remove('show'); editingId=null; }

document.addEventListener('click', async (e) => {
  if (e.target.id === 'carClose') closeEdit();
  if (e.target.id === 'carSave') {
    const body = {
      brand: document.getElementById('eBrand').value.trim(),
      model: document.getElementById('eModel').value.trim(),
      year: document.getElementById('eYear').value,
      plate: document.getElementById('ePlate').value.trim(),
      vin: document.getElementById('eVin').value.trim(),
      basePricePerDay: document.getElementById('ePrice').value
    };
    const res = await fetch(`${api.cars}/${editingId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { alert('Yenilənmədi'); return; }
    closeEdit(); await loadCars();
  }
});

async function deleteCar(id){
  if (!confirm('Maşını silmək istəyirsiniz? Aktiv rezerv varsa silinməyəcək.')) return;
  const res = await fetch(`${api.cars}/${id}`, { method:'DELETE' });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Silinmədi'); return; }
  await loadCars();
}

function renderCarsTable(cars=[]) {
  const el = document.getElementById('carsTbl');
  el.innerHTML = `<tr><th>Marka/Model</th><th>Nömrə</th><th>Günlük AZN</th><th>Status</th><th>Əməliyyat</th></tr>` +
    cars.map(c => `
      <tr>
        <td>${c.brand} ${c.model}</td>
        <td>${c.plate}</td>
        <td>${c.basePricePerDay||0}</td>
        <td><span class="pill">${L[c.status]||c.status}</span></td>
        <td>
          <button class="btn" onclick='openEdit(${JSON.stringify(c)})'>Redaktə</button>
          <button class="btn btn-danger" onclick='deleteCar("${c.id}")'>Sil</button>
        <button class="btn" onclick='location.href="/public/car-expenses.html?carId="+encodeURIComponent(c.id)'>Maşın xərcləri</button>
        </td>
      </tr>
    `).join('');
}

async function loadCars() {
  const res = await fetch(api.cars); const data = await res.json();
  renderCarsTable(data);
}
loadCars();
