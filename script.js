/* ── YOUR FIREBASE CONFIG ── */
const firebaseConfig = {
  apiKey: "AIzaSyD28NllK7J3CCgmAS8ssO2yfTIJgCS5xgk",
  authDomain: "event-registration-collage.firebaseapp.com",
  projectId: "event-registration-collage",
  storageBucket: "event-registration-collage.firebasestorage.app",
  messagingSenderId: "771393841054",
  appId: "1:771393841054:web:fafa154d36ae08a0b8d88f",
  measurementId: "G-8BQFKPN4ZP"
};

/* ── EVENT SEAT CONFIG ── */
const EVENT_TOTAL_SEATS = {
  "Tech Fest 2025": 100,
  "Cultural Night": 150,
  "AI Workshop": 60,
  "Sports Day": 200,
  "Hackathon 24H": 80,
  "Photography Contest": 50
};

/* ── INIT ── */
firebase.initializeApp(firebaseConfig);
const db        = firebase.firestore();
const analytics = firebase.analytics();

/* Update HUD */
const fbStatusEl = document.getElementById('fbStatus');
fbStatusEl.textContent = 'CONNECTED';
fbStatusEl.style.color = 'var(--green)';

/* Live registration count */
db.collection("registrations").get()
  .then(snap => { document.getElementById('regCount').textContent = snap.size; })
  .catch(()  => { document.getElementById('regCount').textContent = '—'; });

/* ── LOAD SEAT COUNTS ── */
async function loadSeatData() {
  try {
    const snap = await db.collection("registrations").get();
    const counts = {};
    snap.forEach(doc => {
      const ev = doc.data().eventName;
      if (ev) counts[ev] = (counts[ev] || 0) + 1;
    });

    // Update each event card with seat info
    document.querySelectorAll('.ecard').forEach(card => {
      const ev = card.dataset.ev;
      const total = EVENT_TOTAL_SEATS[ev] || 100;
      const registered = counts[ev] || 0;
      const left = total - registered;
      const pct = Math.round((registered / total) * 100);

      const seatEl = card.querySelector('.seat-info');
      if (seatEl) {
        const barFill = seatEl.querySelector('.seat-bar-fill');
        const seatText = seatEl.querySelector('.seat-text');
        const seatLeft = seatEl.querySelector('.seat-left');

        barFill.style.width = Math.min(pct, 100) + '%';
        if (pct >= 90)       barFill.classList.add('bar-red');
        else if (pct >= 60)  barFill.classList.add('bar-amber');
        else                 barFill.classList.add('bar-green');

        seatText.textContent = `${registered}/${total} filled`;
        if (left <= 0) {
          seatLeft.textContent = 'FULL';
          seatLeft.classList.add('seat-full');
          card.classList.add('event-full');
        } else if (left <= 10) {
          seatLeft.textContent = `${left} left!`;
          seatLeft.classList.add('seat-low');
        } else {
          seatLeft.textContent = `${left} left`;
        }
      }
    });
  } catch (err) {
    console.error('Seat load error:', err);
  }
}

loadSeatData();

/* ── CLOCK ── */
setInterval(() => {
  document.getElementById('clockHud').textContent = new Date().toTimeString().slice(0, 8);
}, 1000);

/* ── TOAST ── */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + type;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

/* ── STATE ── */
let selEvent = '', selYear = '';

document.querySelectorAll('.ypill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('.ypill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    selYear = p.dataset.y;
    document.getElementById('errYear').style.display = 'none';
  });
});

document.querySelectorAll('.ecard').forEach(c => {
  c.addEventListener('click', () => {
    if (c.classList.contains('event-full')) return;
    document.querySelectorAll('.ecard').forEach(x => x.classList.remove('sel'));
    c.classList.add('sel');
    selEvent = c.dataset.ev;
    document.getElementById('errEvent').style.display = 'none';
  });
});

/* ── NAME SEARCH ── */
const searchInput  = document.getElementById('searchName');
const searchBtn    = document.getElementById('searchBtn');
const searchResult = document.getElementById('searchResult');

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query || query.length < 2) {
    searchResult.innerHTML = `<div class="sr-msg sr-warn">// enter at least 2 characters</div>`;
    searchResult.style.display = 'block';
    return;
  }

  searchBtn.disabled = true;
  searchBtn.textContent = 'SCANNING...';
  searchResult.innerHTML = `<div class="sr-msg sr-loading"><span class="sr-spin">◌</span> Querying Firestore...</div>`;
  searchResult.style.display = 'block';

  try {
    // Search by firstName + lastName combinations
    const [snapFirst, snapFull] = await Promise.all([
      db.collection("registrations")
        .where("firstName", ">=", query)
        .where("firstName", "<=", query + '\uf8ff')
        .get(),
      db.collection("registrations")
        .where("fullName", ">=", query)
        .where("fullName", "<=", query + '\uf8ff')
        .get()
    ]);

    // Merge and deduplicate
    const seen = new Set();
    const results = [];
    [...snapFirst.docs, ...snapFull.docs].forEach(doc => {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        results.push({ id: doc.id, ...doc.data() });
      }
    });

    if (results.length === 0) {
      searchResult.innerHTML = `
        <div class="sr-header">
          <span class="sr-icon">🔍</span>
          <span>Search results for "<strong>${escHtml(query)}</strong>"</span>
        </div>
        <div class="sr-msg sr-empty">// no records found matching "${escHtml(query)}"</div>`;
      return;
    }

    // Count total registrations
    const totalSnap = await db.collection("registrations").get();

    let html = `
      <div class="sr-header">
        <span class="sr-icon">✓</span>
        <span>${results.length} record${results.length > 1 ? 's' : ''} found for "<strong>${escHtml(query)}</strong>"</span>
        <span class="sr-total-badge">TOTAL REGISTRATIONS: ${totalSnap.size}</span>
      </div>
      <div class="sr-list">`;

    results.forEach((r, i) => {
      const ts = r.registeredAt ? new Date(r.registeredAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';
      html += `
        <div class="sr-card" style="animation-delay:${i * 60}ms">
          <div class="sr-card-top">
            <div class="sr-avatar">${(r.firstName || '?')[0].toUpperCase()}</div>
            <div class="sr-info">
              <div class="sr-name">${escHtml(r.fullName || r.firstName + ' ' + r.lastName)}</div>
              <div class="sr-email">${escHtml(r.email || '')}</div>
            </div>
            <div class="sr-event-badge">${escHtml(r.eventName || 'N/A')}</div>
          </div>
          <div class="sr-card-meta">
            <span class="sr-meta-item">🆔 ${escHtml(r.studentId || 'N/A')}</span>
            <span class="sr-meta-item">🎓 ${escHtml(r.department || 'N/A')} / ${escHtml(r.year || '')}</span>
            <span class="sr-meta-item">🕐 ${ts}</span>
          </div>
          <div class="sr-docid">DOC-${r.id.slice(0,8).toUpperCase()}</div>
        </div>`;
    });

    html += `</div>`;
    searchResult.innerHTML = html;

  } catch (err) {
    searchResult.innerHTML = `<div class="sr-msg sr-error">// error: ${escHtml(err.message)}</div>`;
    console.error(err);
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'SEARCH';
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') performSearch(); });

/* ── VALIDATE ── */
function validate() {
  let ok = true;
  [
    ['firstName', 'errFirst', v => v.trim().length > 0],
    ['lastName',  'errLast',  v => v.trim().length > 0],
    ['email',     'errEmail', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)],
    ['studentId', 'errId',    v => v.trim().length > 0],
    ['dept',      'errDept',  v => v !== ''],
  ].forEach(([id, eid, fn]) => {
    const el = document.getElementById(id), err = document.getElementById(eid);
    if (!fn(el.value)) { el.classList.add('invalid');    err.style.display = 'block'; ok = false; }
    else               { el.classList.remove('invalid'); err.style.display = 'none'; }
  });
  if (!selYear)  { document.getElementById('errYear').style.display  = 'block'; ok = false; }
  if (!selEvent) { document.getElementById('errEvent').style.display = 'block'; ok = false; }
  return ok;
}

/* ── SUBMIT → FIRESTORE ── */
async function handleSubmit() {
  if (!validate()) return;

  const btn = document.getElementById('submitBtn');
  const txt = document.getElementById('btnText');
  btn.disabled    = true;
  txt.textContent = 'WRITING TO FIRESTORE...';

  const firstName = document.getElementById('firstName').value.trim();
  const lastName  = document.getElementById('lastName').value.trim();

  const data = {
    firstName,
    lastName,
    fullName:     firstName + ' ' + lastName,
    email:        document.getElementById('email').value.trim(),
    phone:        document.getElementById('phone').value.trim() || 'N/A',
    studentId:    document.getElementById('studentId').value.trim(),
    department:   document.getElementById('dept').value,
    year:         selYear,
    eventName:    selEvent,
    message:      document.getElementById('message').value.trim() || '',
    timestamp:    firebase.firestore.FieldValue.serverTimestamp(),
    registeredAt: new Date().toISOString()
  };

  try {
    const docRef = await db.collection("registrations").add(data);

    /* Refresh count */
    const snap = await db.collection("registrations").get();
    document.getElementById('regCount').textContent = snap.size;

    /* Refresh seat data */
    loadSeatData();

    /* Show success */
    document.getElementById('formWrapper').style.display   = 'none';
    document.getElementById('successScreen').style.display = 'block';
    document.getElementById('sEvent').textContent  = selEvent.toUpperCase();
    document.getElementById('sRegId').textContent  = 'DOC-' + docRef.id.slice(0, 8).toUpperCase();
    document.getElementById('sDetail').innerHTML   =
      `NAME &nbsp;→ <span>${data.fullName}</span><br>` +
      `EMAIL → <span>${data.email}</span><br>` +
      `DEPT &nbsp;→ <span>${data.department} / ${data.year}</span><br>` +
      `ID &nbsp;&nbsp;&nbsp;→ <span>${data.studentId}</span>`;

    showToast('✓ REGISTRATION SAVED TO FIRESTORE', 'success');
    analytics.logEvent('event_registration', { event_name: selEvent, department: data.department });

  } catch (err) {
    console.error('Firestore error:', err);
    showToast('✗ ERROR: ' + err.message, 'error');
  } finally {
    btn.disabled    = false;
    txt.textContent = 'INITIALIZE REGISTRATION';
  }
}

/* ── RESET ── */
function resetForm() {
  document.getElementById('successScreen').style.display = 'none';
  document.getElementById('formWrapper').style.display   = 'block';
  ['firstName', 'lastName', 'email', 'phone', 'studentId', 'message']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('dept').value = '';
  document.querySelectorAll('.ecard').forEach(c => c.classList.remove('sel'));
  document.querySelectorAll('.ypill').forEach(p => p.classList.remove('active'));
  selEvent = ''; selYear = '';
}
