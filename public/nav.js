async function injectNav() {
  const res = await fetch('/public/nav.html');
  const html = await res.text();
  const nav = document.createElement('div');
  nav.innerHTML = html;
  document.body.prepend(nav.firstChild);
}
injectNav();
