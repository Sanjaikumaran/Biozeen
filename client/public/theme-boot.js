// Applies the saved theme before the app loads, so the page doesn't flash the default colours.
// Kept in sync with src/lib/theme.tsx (storage key and attribute names).
;(function () {
  var t = {}
  try { t = JSON.parse(sessionStorage.getItem('bian.theme') || '{}') } catch (e) { /* use defaults */ }
  var accents = ['forest', 'ocean', 'teal', 'indigo', 'plum', 'terracotta', 'custom']
  var mode = t.mode === 'light' || t.mode === 'dark' ? t.mode : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  var root = document.documentElement
  root.setAttribute('data-accent', accents.indexOf(t.accent) >= 0 ? t.accent : 'forest')
  root.setAttribute('data-mode', mode)
  if (t.accent === 'custom') root.style.setProperty('--custom-base', /^#[0-9a-f]{6}$/i.test(t.custom) ? t.custom : '#6d28d9')
})()
