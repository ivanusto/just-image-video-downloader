// Just IG Image Downloader popup script (v3.0)
const chromeAPI = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULTS = {
  corner: 'top-left',
  filenameTemplate: '{username}_{type}_{timestamp}'
};

const cornerGrid = document.getElementById('corner-grid');
const templateInput = document.getElementById('filename-template');
const previewEl = document.getElementById('filename-preview');
const savedMsg = document.getElementById('saved-msg');

let savedTimer = null;
function flashSaved() {
  savedMsg.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => savedMsg.classList.remove('show'), 1200);
}

function updatePreview() {
  const sample = (templateInput.value || DEFAULTS.filenameTemplate)
    .replace(/\{username\}/g, 'natgeo')
    .replace(/\{type\}/g, 'post')
    .replace(/\{timestamp\}/g, '20260612T103000')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  previewEl.textContent = `預覽：${sample}.jpg`;
}

function renderCorner(corner) {
  for (const btn of cornerGrid.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.corner === corner);
  }
}

cornerGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-corner]');
  if (!btn) return;
  renderCorner(btn.dataset.corner);
  chromeAPI.storage.local.set({ corner: btn.dataset.corner }).then(flashSaved);
});

let inputTimer = null;
templateInput.addEventListener('input', () => {
  updatePreview();
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    const value = templateInput.value.trim() || DEFAULTS.filenameTemplate;
    chromeAPI.storage.local.set({ filenameTemplate: value }).then(flashSaved);
  }, 400);
});

chromeAPI.storage.local.get(DEFAULTS).then((saved) => {
  renderCorner(saved.corner);
  templateInput.value = saved.filenameTemplate;
  updatePreview();
});
