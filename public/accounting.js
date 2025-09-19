(function(){
  function $(id){ return document.getElementById(id); }
  const els = {
    get aMonth(){ return $('aMonth'); },
    get aApply(){ return $('aApply'); },
    get btnRefresh(){ return $('btnRefresh'); },
    get aTotal(){ return $('aTotal'); },
    get aCount(){ return $('aCount'); },
    get aTbl(){ return $('aTbl'); },
  };

  function fmt(dt){
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(+d)) return String(dt);
    return d.toLocaleString();
  }

  function setDefaultMonth(){
    const el = els.aMonth;
    if (!el) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    el.value = `${y}-${m}`;
  }

  async function loadRevenue(){
    const monthVal = els.aMonth && els.aMonth.value ? els.aMonth.value : '';
    const q = monthVal ? (`?month=${encodeURIComponent(monthVal)}`) : '';
    const res = await fetch(`/api/revenue${q}`);
    if (!res.ok){
      els.aTotal.textContent = '0';
      els.aCount.textContent = '0';
      els.aTbl.innerHTML = `<tr><td colspan="11">Xəta: Gəlir məlumatı alına bilmədi.</td></tr>`;
      return;
    }
    const data = await res.json();
    els.aTotal.textContent = (data.total ?? 0);
    els.aCount.textContent = (data.count ?? 0);

    const rows = (data.items || []).map((r, idx) => {
      const unit = (r.unitPrice != null) ? Number(r.unitPrice) : '';
      const disc = (r.discountPercent != null) ? Number(r.discountPercent) : 0;
      const total = (r.totalPrice != null) ? Number(r.totalPrice) : 0;
      return `<tr>
        <td>${idx+1}</td>
        <td>${fmt(r.startAt)}</td>
        <td>${fmt(r.endAt)}</td>
        <td>${r.days ?? ''}</td>
        <td>${r.carName ?? ''}</td>
        <td>${r.customerName ?? ''}</td>
        <td>${unit}</td>
        <td>${disc}</td>
        <td><b>${total}</b></td>
        <td>${r.status ?? ''}</td>
        <td>${r.destination ?? ''}</td>
      </tr>`;
    }).join('');

    els.aTbl.innerHTML = rows || `<tr><td colspan="11">Bu ay üçün uyğun bron tapılmadı.</td></tr>`;
  }

  function init(){
    setDefaultMonth();
    if (els.aApply) els.aApply.addEventListener('click', loadRevenue);
    if (els.btnRefresh) els.btnRefresh.addEventListener('click', loadRevenue);
    loadRevenue();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();