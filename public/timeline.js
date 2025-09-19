const api = {
  cars: '/api/cars',
  reservations: '/api/reservations',
  customers: '/api/customers'
};

function fmt(dt){ try { return new Date(dt).toLocaleString(); } catch(e){ return dt; } }
const Lcar = { FREE:'Bron üçün uyğundur', RESERVED:'Brondadır', IN_USE:'İstifadədədir', SERVICE:'Təmir/Texniki xidmət', BLOCKED:'Bloklanıb' };

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function initDefaults(){
  const startInp = document.getElementById('tlStart');
  const now = new Date();
  // default: today 00:00
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  startInp.value = new Date(d.getTime() - 3*24*3600*1000).toISOString().slice(0,16); // 3 gün geri
}

async function loadTimeline(){
  const [cars, resvs, customers] = await Promise.all([
    (await fetch(api.cars)).json(),
    (await fetch(api.reservations)).json(),
    (await fetch(api.customers)).json()
  ]);

  const startStr = document.getElementById('tlStart').value;
  const days = Number(document.getElementById('tlDays').value || 30);
  const filter = (document.getElementById('tlFilter').value || '').toLowerCase();
  const start = new Date(startStr || new Date());
  const end = new Date(start.getTime() + days*24*3600*1000);
  const rangeMs = end - start;

  const tl = document.getElementById('tl');
  const scale = document.getElementById('tlScale');
  tl.innerHTML = '';
  // scale labels: 0%,25,50,75,100
  const ticks = [0, .25, .5, .75, 1].map(x => new Date(start.getTime() + x*rangeMs));
  scale.innerHTML = ticks.map(t => `<span>${t.toLocaleDateString()}</span>`).join('');

  const byId = Object.fromEntries(customers.map(c => [c.id, c]));

  const carsFiltered = filter ? cars.filter(c => ((c.plate||'')+(c.brand||'')+(c.model||'')).toLowerCase().includes(filter)) : cars;

  for (const car of carsFiltered){
    // container row
    const row = document.createElement('div');
    row.className = 'grid-tl';
    const head = document.createElement('div');
    head.className = 'row-head';
    head.innerHTML = `<div><b>${car.brand||''} ${car.model||''}</b> — ${car.plate}</div><div class="helper">Status: ${Lcar[car.status]||car.status}</div>`;
    const trackWrap = document.createElement('div');
    const track = document.createElement('div');
    track.className = 'track';
    trackWrap.appendChild(track);
    row.appendChild(head);
    row.appendChild(trackWrap);
    tl.appendChild(row);

    // Bars
    const rel = resvs
      .filter(r => r.carId === car.id)
      .map(r => ({
        ...r,
        s: new Date(r.startAt || (r.startDate? `${r.startDate}T00:00` : null)),
        e: new Date(r.endAt || (r.endDate? `${r.endDate}T00:00` : null))
      }))
      .filter(r => r.s && r.e && r.e > start && r.s < end);

    for (const r of rel){
      const visS = new Date(Math.max(r.s, start));
      const visE = new Date(Math.min(r.e, end));
      const leftPct = clamp( (visS - start) / rangeMs * 100, 0, 100);
      const widthPct = clamp( (visE - visS) / rangeMs * 100, 0, 100 - leftPct);
      const seg = document.createElement('div');
      seg.className = `seg ${r.status}`;
      const cu = byId[r.customerId];
      seg.style.left = leftPct + '%';
      seg.style.width = widthPct + '%';
      seg.title = `${r.status}\n${fmt(r.startAt||r.startDate)} → ${fmt(r.endAt||r.endDate)}\n${cu? (cu.firstName+' '+cu.lastName) : ''}`;
      seg.innerText = `${cu? (cu.firstName+' '+cu.lastName) : ''}`;
      track.appendChild(seg);
    }

    // Now marker
    const now = new Date();
    if (now >= start && now <= end){
      const x = (now - start)/rangeMs * 100;
      const nowLine = document.createElement('div');
      nowLine.className = 'now-line';
      nowLine.style.left = x + '%';
      track.appendChild(nowLine);
    }
  }
}

document.getElementById('tlApply').addEventListener('click', loadTimeline);

initDefaults();
loadTimeline();
