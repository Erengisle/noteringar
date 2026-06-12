'use strict';

// ── Storage ──────────────────────────────────────────────────────────────────

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let notes    = load('notes', []);
let contacts = load('contacts', { colleagues: [], students: [] });
let settings = load('settings', { studentSheetUrl: '', colleagueSheetUrl: '' });

function saveNotes()    { save('notes', notes); }
function saveContacts() { save('contacts', contacts); }
function saveSettings() { save('settings', settings); }

// ── State ────────────────────────────────────────────────────────────────────

let currentTab = 'active';
let selectedCat = null;
let editingContact = null;

// ── Categories ───────────────────────────────────────────────────────────────

const CATS = {
  kontakta: { label: 'Kontakta',  cls: 'cat-kontakta' },
  kollup:   { label: 'Kolla upp', cls: 'cat-kollup'   },
  paminn:   { label: 'Kom ihåg!', cls: 'cat-paminn'   },
  attgora:  { label: 'Att göra',  cls: 'cat-attgora'  },
  foljupp:  { label: 'Följ upp',  cls: 'cat-foljupp'  },
};

// Kategorier som visar person-fält
const CATS_WITH_PERSON  = new Set(['kontakta', 'paminn', 'attgora', 'foljupp']);
// Kategorier som visar kontaktväljare (sparade kontakter)
const CATS_WITH_PICKER  = new Set(['kontakta', 'foljupp']);
// Kategorier som visar kalenderknapp
const CATS_WITH_CAL     = new Set(['kontakta', 'paminn', 'attgora']);

// ── Render helpers ────────────────────────────────────────────────────────────

function fmtDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderNoteCard(note, idx) {
  const cat  = CATS[note.cat];
  const done = note.done;
  const card = document.createElement('div');
  card.className = 'note-card' + (done ? ' done' : '');
  card.dataset.idx = idx;
  card.dataset.cat = note.cat;

  const badge  = `<span class="cat-badge ${cat.cls}">${cat.label}</span>`;
  const person = note.personName ? `<span class="note-person">${escHtml(note.personName)}</span>` : '';
  const date   = `<span class="note-date">${fmtDate(note.created)}</span>`;

  let actions = '';

  // Ring-knapp
  if (note.personPhone) {
    actions += `<a class="btn-call" href="tel:${escHtml(note.personPhone)}">📞 Ring</a>`;
  }

  // E-post (kontakta)
  if (note.cat === 'kontakta' && note.personEmail) {
    const subject = encodeURIComponent('Angående: ' + (note.text || ''));
    const body    = encodeURIComponent(note.text || '');
    actions += `<a class="btn-email" href="mailto:${note.personEmail}?subject=${subject}&body=${body}">✉ Öppna e-post</a>`;
  }

  // Kalender (kontakta, kom ihåg, att göra)
  if (CATS_WITH_CAL.has(note.cat)) {
    const calTitle   = encodeURIComponent((note.personName ? note.personName + ': ' : '') + (note.text || ''));
    const calDetails = encodeURIComponent(note.text || '');
    let calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&details=${calDetails}`;
    if (note.personEmail) calUrl += `&add=${encodeURIComponent(note.personEmail)}`;
    actions += `<a class="btn-calendar" href="${calUrl}" target="_blank" rel="noopener">📅 Boka tid</a>`;
  }

  if (!done) {
    actions += `<button class="btn-done" data-action="toggle" data-idx="${idx}">✓ Markera klar</button>`;
  }
  actions += `<button class="btn-edit" data-action="edit-note" data-idx="${idx}">Redigera</button>`;
  actions += `<button class="btn-delete" data-action="delete" data-idx="${idx}">Ta bort</button>`;

  card.innerHTML = `
    <div class="note-stripe"></div>
    <div class="note-inner">
      <div class="note-meta">${badge}${person}${date}</div>
      <div class="note-text">${escHtml(note.text)}</div>
      <div class="note-actions">${actions}</div>
    </div>`;
  return card;
}

function renderNotes() {
  const container = document.getElementById('note-list');
  container.innerHTML = '';
  const filtered = notes
    .map((n, i) => ({ ...n, _i: i }))
    .filter(n => currentTab === 'history' ? n.done : !n.done)
    .sort((a, b) => b.created.localeCompare(a.created));

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">${currentTab === 'history' ? 'Ingen historik än.' : 'Inga aktiva noteringar.'}</div>`;
    return;
  }
  filtered.forEach(n => container.appendChild(renderNoteCard(n, n._i)));
}

function renderContacts() {
  renderGroup('colleague-list', contacts.colleagues, 'colleague');
  renderGroup('student-list', contacts.students, 'student');
}

function renderGroup(containerId, list, type) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  list.forEach((c, i) => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    const metaParts = [];
    if (type === 'student') {
      if (c.klass)    metaParts.push(c.klass);
      if (c.guardian) metaParts.push('VH: ' + c.guardian);
    } else {
      if (c.email) metaParts.push(c.email);
    }
    if (c.phone) metaParts.push('📞 ' + c.phone);
    const meta = metaParts.join(' · ');
    item.innerHTML = `
      <span class="name">${escHtml(c.name)}</span>
      <span class="meta">${escHtml(meta)}</span>
      <button class="btn-icon" data-action="edit-contact" data-type="${type}" data-idx="${i}" aria-label="Redigera">✏️</button>
      <button class="btn-icon" data-action="del-contact"  data-type="${type}" data-idx="${i}" aria-label="Ta bort">🗑</button>`;
    el.appendChild(item);
  });
}

// ── Tab rendering ─────────────────────────────────────────────────────────────

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('notes-view').classList.toggle('hidden', tab === 'contacts');
  document.getElementById('contacts-view').classList.toggle('hidden', tab !== 'contacts');

  const quickCatsSection = document.querySelector('.quick-cats');
  const quickCatsLabel   = quickCatsSection?.previousElementSibling;
  const notesLabel = document.getElementById('notes-label');
  if (quickCatsSection) quickCatsSection.style.display = tab === 'active' ? 'grid' : 'none';
  if (quickCatsLabel)   quickCatsLabel.style.display   = tab === 'active' ? ''     : 'none';
  if (notesLabel) notesLabel.textContent = tab === 'history' ? 'Historik' : 'Aktiva ärenden';

  if (tab !== 'contacts') renderNotes();
  else renderContacts();
}

// ── Note modal helpers ───────────────────────────────────────────────────────────

function onCatSelect(cat) {
  selectedCat = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('selected', b.dataset.cat === cat));

  const showPicker = CATS_WITH_PICKER.has(cat);
  const showPerson = CATS_WITH_PERSON.has(cat);

  document.getElementById('person-group').style.display        = showPicker ? 'block' : 'none';
  document.getElementById('manual-person-fields').style.display = showPerson ? 'block' : 'none';

  if (!showPicker) return;

  const sel = document.getElementById('person-select');
  sel.innerHTML = '<option value="">– Välj sparad kontakt (valfritt) –</option>';
  if (contacts.colleagues.length) {
    const g = document.createElement('optgroup');
    g.label = 'Kollegor';
    contacts.colleagues.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = `colleague:${i}`;
      o.textContent = c.name;
      g.appendChild(o);
    });
    sel.appendChild(g);
  }
  if (contacts.students.length) {
    const g = document.createElement('optgroup');
    g.label = 'Elever';
    contacts.students.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = `student:${i}`;
      o.textContent = c.name + (c.klass ? ' (' + c.klass + ')' : '');
      g.appendChild(o);
    });
    sel.appendChild(g);
  }
}

function fillManualFromContact(val) {
  if (!val) return;
  const [type, idx] = val.split(':');
  const c = type === 'colleague' ? contacts.colleagues[+idx] : contacts.students[+idx];
  if (!c) return;
  document.getElementById('manual-name').value  = c.name  || '';
  document.getElementById('manual-phone').value = c.phone || '';
}

function openNewNote(preselectedCat) {
  selectedCat = null;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('note-text').value   = '';
  document.getElementById('manual-name').value  = '';
  document.getElementById('manual-phone').value = '';
  document.getElementById('person-select').innerHTML = '<option value="">– Välj sparad kontakt (valfritt) –</option>';
  document.getElementById('person-group').style.display         = 'none';
  document.getElementById('manual-person-fields').style.display = 'none';
  delete document.getElementById('note-modal').dataset.editIdx;
  document.getElementById('note-modal-title').textContent = 'Ny notering';
  document.getElementById('note-modal').classList.remove('hidden');
  if (preselectedCat) onCatSelect(preselectedCat);
  setTimeout(() => document.getElementById('note-text').focus(), 100);
}

function openEditNote(idx) {
  const note = notes[idx];
  selectedCat = null;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('note-text').value    = note.text;
  document.getElementById('manual-name').value  = note.personName  || '';
  document.getElementById('manual-phone').value = note.personPhone || '';
  document.getElementById('person-group').style.display         = 'none';
  document.getElementById('manual-person-fields').style.display = 'none';
  document.getElementById('note-modal').dataset.editIdx = idx;
  document.getElementById('note-modal-title').textContent = 'Redigera notering';
  document.getElementById('note-modal').classList.remove('hidden');
  onCatSelect(note.cat);
  setTimeout(() => {
    const sel = document.getElementById('person-select');
    for (const opt of sel.options) {
      if (!opt.value) continue;
      const [type, i] = opt.value.split(':');
      const c = type === 'colleague' ? contacts.colleagues[+i] : contacts.students[+i];
      if (c?.name === note.personName) { sel.value = opt.value; break; }
    }
    document.getElementById('note-text').focus();
  }, 50);
}

function closeNewNote() {
  document.getElementById('note-modal').classList.add('hidden');
}

function saveNote() {
  if (!selectedCat) { alert('Välj en kategori.'); return; }
  const text = document.getElementById('note-text').value.trim();
  if (!text) { alert('Skriv en kort notering.'); return; }

  // Hämta personuppgifter: manuella fält är källan, e-post från sparad kontakt
  const personName  = document.getElementById('manual-name').value.trim();
  const personPhone = document.getElementById('manual-phone').value.trim();
  let personEmail = '';
  const selVal = document.getElementById('person-select').value;
  if (selVal) {
    const [type, idx] = selVal.split(':');
    const c = type === 'colleague' ? contacts.colleagues[+idx] : contacts.students[+idx];
    personEmail = c?.email || '';
  }

  const editIdx = document.getElementById('note-modal').dataset.editIdx;
  if (editIdx !== undefined) {
    const n = notes[+editIdx];
    n.cat = selectedCat; n.text = text;
    n.personName = personName; n.personEmail = personEmail; n.personPhone = personPhone;
  } else {
    notes.push({ cat: selectedCat, text, personName, personEmail, personPhone, created: new Date().toISOString(), done: false });
  }
  saveNotes();
  closeNewNote();
  renderNotes();
}

// ── Contact modal ─────────────────────────────────────────────────────────────

function openContactModal(type, idx) {
  editingContact = idx !== undefined ? { type, idx } : { type, idx: null };
  const isNew = editingContact.idx === null;
  const c = isNew ? {} : (type === 'colleague' ? contacts.colleagues[idx] : contacts.students[idx]);

  document.getElementById('contact-modal-title').textContent = isNew
    ? (type === 'colleague' ? 'Lägg till kollega' : 'Lägg till elev')
    : 'Redigera';

  document.getElementById('contact-name').value    = c.name    || '';
  document.getElementById('contact-email').value   = c.email   || '';
  document.getElementById('contact-phone').value   = c.phone   || '';

  const studentFields = document.getElementById('student-fields');
  studentFields.style.display = type === 'student' ? 'block' : 'none';
  document.getElementById('contact-klass').value    = c.klass    || '';
  document.getElementById('contact-guardian').value = c.guardian || '';

  document.getElementById('contact-modal').classList.remove('hidden');
  document.getElementById('contact-name').focus();
}

function closeContactModal() {
  document.getElementById('contact-modal').classList.add('hidden');
  editingContact = null;
}

function saveContact() {
  const name = document.getElementById('contact-name').value.trim();
  if (!name) { alert('Ange ett namn.'); return; }

  const { type, idx } = editingContact;
  const list = type === 'colleague' ? contacts.colleagues : contacts.students;
  const entry = {
    name,
    email:    document.getElementById('contact-email').value.trim(),
    phone:    document.getElementById('contact-phone').value.trim(),
    klass:    type === 'student' ? document.getElementById('contact-klass').value.trim()    : undefined,
    guardian: type === 'student' ? document.getElementById('contact-guardian').value.trim() : undefined,
  };

  if (idx === null) list.push(entry);
  else list[idx] = entry;

  saveContacts();
  closeContactModal();
  renderContacts();
}

// ── Contact Picker API ────────────────────────────────────────────────────────

async function pickFromPhoneContacts() {
  try {
    const picked = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: false });
    if (!picked.length) return;
    const c = picked[0];
    if (c.name?.[0])  document.getElementById('contact-name').value  = c.name[0];
    if (c.email?.[0]) document.getElementById('contact-email').value = c.email[0];
    if (c.tel?.[0])   document.getElementById('contact-phone').value = c.tel[0];
  } catch { /* avbruten */ }
}

// ── Google Sheets import ──────────────────────────────────────────────────────

const STUDENT_COLS   = { name: 0, email: 1, klass: 2, guardian: 3, phone: 4 };
const COLLEAGUE_COLS = { name: 0, email: 1, phone: 2 };

function parseSheetUrl(url) {
  if (!url) return null;
  const idMatch  = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  if (!idMatch) return null;
  return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : '0' };
}

function sheetCsvUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// ── Settings modal ────────────────────────────────────────────────────────────

function openSettings() {
  document.getElementById('settings-student-url').value   = settings.studentSheetUrl   || '';
  document.getElementById('settings-colleague-url').value = settings.colleagueSheetUrl || '';
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function saveSettingsForm() {
  settings.studentSheetUrl   = document.getElementById('settings-student-url').value.trim();
  settings.colleagueSheetUrl = document.getElementById('settings-colleague-url').value.trim();
  saveSettings();
  closeSettings();
}

function parseCSV(text) {
  return text.trim().split('\n').map(row => {
    const cells = [];
    let cur = '', inQ = false;
    for (const ch of row) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

async function importFromSheet(type) {
  const url = type === 'students' ? settings.studentSheetUrl : settings.colleagueSheetUrl;
  const cfg = parseSheetUrl(url);
  if (!cfg) {
    openSettings();
    alert('Klistra in länken till ditt Google Sheet under Inställningar först.');
    return;
  }
  const btn = document.getElementById(type === 'students' ? 'import-students-btn' : 'import-colleagues-btn');
  const orig = btn.textContent;
  btn.textContent = 'Hämtar…';
  btn.disabled = true;
  try {
    const res = await fetch(sheetCsvUrl(cfg.id, cfg.gid));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text());
    const cols = type === 'students' ? STUDENT_COLS : COLLEAGUE_COLS;
    const imported = rows.slice(1).map(r => ({
      name:     (r[cols.name]  || '').trim(),
      email:    (r[cols.email] || '').trim(),
      phone:    cols.phone    != null ? (r[cols.phone]    || '').trim() : undefined,
      klass:    cols.klass    != null ? (r[cols.klass]    || '').trim() : undefined,
      guardian: cols.guardian != null ? (r[cols.guardian] || '').trim() : undefined,
    })).filter(c => c.name);
    const list = type === 'students' ? contacts.students : contacts.colleagues;
    imported.forEach(imp => {
      const existing = list.find(c => c.name === imp.name);
      if (existing) {
        if (imp.email)    existing.email    = imp.email;
        if (imp.phone)    existing.phone    = imp.phone;
        if (imp.klass)    existing.klass    = imp.klass;
        if (imp.guardian) existing.guardian = imp.guardian;
      } else {
        list.push(imp);
      }
    });
    saveContacts();
    renderContacts();
    btn.textContent = `✓ ${imported.length} importerade`;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
  } catch (err) {
    alert('Kunde inte hämta sheetet.\n\n' + err.message);
    btn.textContent = orig;
    btn.disabled = false;
  }
}

// ── Event delegation ──────────────────────────────────────────────────────────

document.addEventListener('click', e => {
  const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
  const el = e.target.dataset.action ? e.target : e.target.closest('[data-action]');
  if (!el) return;

  switch (action) {
    case 'toggle': {
      const i = +el.dataset.idx;
      notes[i].done = !notes[i].done;
      saveNotes(); renderNotes();
      break;
    }
    case 'edit-note':   openEditNote(+el.dataset.idx); break;
    case 'delete': {
      if (!confirm('Ta bort notering?')) return;
      notes.splice(+el.dataset.idx, 1);
      saveNotes(); renderNotes();
      break;
    }
    case 'edit-contact': openContactModal(el.dataset.type, +el.dataset.idx); break;
    case 'del-contact': {
      if (!confirm('Ta bort kontakt?')) return;
      const list = el.dataset.type === 'colleague' ? contacts.colleagues : contacts.students;
      list.splice(+el.dataset.idx, 1);
      saveContacts(); renderContacts();
      break;
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Nav
  document.querySelectorAll('nav button').forEach(b =>
    b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Snabbknappar
  document.querySelectorAll('.quick-cat-btn').forEach(b =>
    b.addEventListener('click', () => openNewNote(b.dataset.quickCat)));

  // Kategoriknappar i modal
  document.querySelectorAll('.cat-btn').forEach(b =>
    b.addEventListener('click', () => onCatSelect(b.dataset.cat)));

  // Kontaktväljare: auto-fyll manuella fält
  document.getElementById('person-select').addEventListener('change', e =>
    fillManualFromContact(e.target.value));

  // Noterings-modal
  document.getElementById('save-note-btn').addEventListener('click', saveNote);
  document.getElementById('cancel-note-btn').addEventListener('click', closeNewNote);
  document.getElementById('cancel-note-btn-2').addEventListener('click', closeNewNote);

  // Kontakt-modal
  document.getElementById('save-contact-btn').addEventListener('click', saveContact);
  document.getElementById('cancel-contact-btn').addEventListener('click', closeContactModal);
  document.getElementById('cancel-contact-btn-2').addEventListener('click', closeContactModal);

  // Contact Picker
  const pickBtn = document.getElementById('pick-phone-contact-btn');
  if ('contacts' in navigator && 'ContactsManager' in window) {
    pickBtn.classList.remove('hidden');
    pickBtn.addEventListener('click', pickFromPhoneContacts);
  }

  // Lägg till kontakt-knappar
  document.getElementById('add-colleague-btn').addEventListener('click', () => openContactModal('colleague'));
  document.getElementById('add-student-btn').addEventListener('click',   () => openContactModal('student'));

  // Import-knappar
  document.getElementById('import-students-btn').addEventListener('click',   () => importFromSheet('students'));
  document.getElementById('import-colleagues-btn').addEventListener('click', () => importFromSheet('colleagues'));

  // Inställningar
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettingsForm);
  document.getElementById('cancel-settings-btn').addEventListener('click', closeSettings);
  document.getElementById('cancel-settings-btn-2').addEventListener('click', closeSettings);

  // Röstinmatning
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const voiceBtn    = document.getElementById('voice-btn');
    const recognition = new SpeechRecognition();
    recognition.lang = 'sv-SE';
    recognition.continuous = false;
    recognition.interimResults = false;
    let listening = false;

    voiceBtn.classList.remove('hidden');

    voiceBtn.addEventListener('click', () => {
      if (listening) { recognition.stop(); return; }
      recognition.start();
      listening = true;
      voiceBtn.classList.add('listening');
      voiceBtn.textContent = '⏹ Stoppa';
    });

    recognition.onresult = e => {
      const transcript = e.results[0][0].transcript;
      const ta = document.getElementById('note-text');
      ta.value = (ta.value ? ta.value + ' ' : '') + transcript;
    };

    recognition.onend = recognition.onerror = () => {
      listening = false;
      voiceBtn.classList.remove('listening');
      voiceBtn.textContent = '🎤 Diktera';
    };
  }

  // Tangentbord
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeNewNote(); closeContactModal(); closeSettings(); }
  });

  // Service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

  showTab('active');
});
