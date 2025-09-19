(function(){
  function $(id){ return document.getElementById(id); }
  const els = {
    get q(){ return $('searchPlate'); },
    get btn(){ return $('btnSearch'); },
    get out(){ return $('searchResult'); },
  };

  function htmlEscape(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function render(data){
    if (!data || !data.found){
      els.out.innerHTML = `<div class="note">Maşın tapılmadı.</div>`;
      return;
    }
    const c = data.car;
    const cur = data.currentReservation;
    const next = data.nextReservation;
    els.out.innerHTML = `
      <div class="card">
        <div><b>Maşın:</b> ${htmlEscape(c.brand)} ${htmlEscape(c.model)} — ${htmlEscape(c.plate)} <span class="tag">${htmlEscape(c.status)}</span></div>
        <div class="divider"></div>
        <div class="row">
          <div class="col">
            <h4>Hazırki rezerv</h4>
            ${cur ? `
              <div>Başlanğıc: ${htmlEscape(cur.startAt)}</div>
              <div>Bitiş: ${htmlEscape(cur.endAt)}</div>
              <div>Müştəri: ${htmlEscape(cur.customerName)}</div>
              <div>Məbləğ: ${cur.totalPrice ?? ''}</div>
            ` : '<i>—</i>'}
          </div>
          <div class="col">
            <h4>Növbəti rezerv</h4>
            ${next ? `
              <div>Başlanğıc: ${htmlEscape(next.startAt)}</div>
              <div>Bitiş: ${htmlEscape(next.endAt)}</div>
              <div>Müştəri: ${htmlEscape(next.customerName)}</div>
              <div>Məbləğ: ${next.totalPrice ?? ''}</div>
            ` : '<i>—</i>'}
          </div>
        </div>
      </div>
    `;
  }

  async function run(){
    const raw = els.q && els.q.value ? els.q.value : '';
    const q = raw.trim();
    if (!q){
      els.out.innerHTML = `<div class="note">Nömrəni daxil edin.</div>`;
      return;
    }
    const url = `/api/search?plate=${encodeURIComponent(q)}`;
    let text, data;

    try{
      const res = await fetch(url, { headers: { 'Accept':'application/json' } });
      text = await res.text();

      if (!res.ok){
        try { data = JSON.parse(text); } catch { data = null; }
        const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
        els.out.innerHTML = `<div class="error">Xəta: ${htmlEscape(msg)}</div>`;
        return;
      }

      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      if (!ctype.includes('application/json')){
        els.out.innerHTML = `<div class="error">Xəta: Gözlənilməz cavab (JSON deyil)</div>`;
        return;
      }
      data = JSON.parse(text);
    }catch(e){
      els.out.innerHTML = `<div class="error">Şəbəkə xətası: ${htmlEscape(e.message)}</div>`;
      return;
    }
    render(data);
  }

  function init(){
    if (els.btn) els.btn.addEventListener('click', run);
    const form = document.querySelector('#searchForm');
    if (form) form.addEventListener('submit', (ev)=>{ ev.preventDefault(); run(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();