// Applies the saved theme before the app loads, so the page doesn't flash the default colours.
// Kept in sync with src/lib/theme.tsx (storage key and attribute names).
;(function () {
  var t = {}
  try { t = JSON.parse(localStorage.getItem('bian.theme') || '{}') } catch (e) { /* use defaults */ }
  var accents = ['forest', 'ocean', 'teal', 'indigo', 'plum', 'terracotta']
  var mode = t.mode === 'light' || t.mode === 'dark' ? t.mode : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  var root = document.documentElement
  root.setAttribute('data-accent', accents.indexOf(t.accent) >= 0 ? t.accent : 'forest')
  root.setAttribute('data-mode', mode)
})()
