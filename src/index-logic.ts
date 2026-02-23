import { supabase } from './supabase.js'

// ── State ─────────────────────────────────────────
let courts: any[] = [];
let selectedCourtId: string | null = null;
let selectedSlots = new Set<number>();  // set of hour indices, e.g. {9, 10}
let bookedSlots = new Set<number>();    // hours already booked for selected date+court
let selectedDate = '';

// ── DOM ───────────────────────────────────────────
const $courtsGrid = document.getElementById('courts-grid') as HTMLElement;
const $bookingPanel = document.getElementById('booking-panel') as HTMLElement;
const $bookingsList = document.getElementById('bookings-list') as HTMLElement;

// ── Tabs ──────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const b = btn as HTMLElement;
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        b.classList.add('active');
        const tabId = b.dataset.tab;
        if (tabId) {
            document.getElementById(tabId)?.classList.add('active');
            if (tabId === 'bookings') loadBookings();
        }
    });
});

// ── Toast ─────────────────────────────────────────
function toast(msg: string, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toast-container')?.appendChild(el);
    setTimeout(() => el.remove(), 4200);
}

// ── Format ────────────────────────────────────────
function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
        + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtHour(h: number) {
    return `${String(h).padStart(2, '0')}:00`;
}

// ── Load Courts ──────────────────────────────────
async function loadCourts() {
    try {
        const { data, error } = await supabase
            .from('courts')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (error) throw error;
        courts = data || [];
        renderCourts();
    } catch { toast('Erreur de chargement des terrains', 'error'); }
}

function renderCourts() {
    if (!courts.length) {
        $courtsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon">🏗️</div><p>Aucun terrain trouvé</p></div>`;
        return;
    }
    $courtsGrid.innerHTML = courts.map(c => `
    <div class="court-card ${selectedCourtId === c.id ? 'selected' : ''}"
         data-id="${c.id}" data-sport="${c.sport}"
         onclick="window.selectCourt('${c.id}')">
      <div class="court-sport-icon">${c.sport === 'padel' ? '🏸' : '⚽'}</div>
      <div class="court-name">${c.name}</div>
      <span class="court-badge ${c.sport}">${c.sport}</span>
      <div class="court-price">${c.price_per_hour} DA<span class="unit">/heure</span></div>
      <div class="court-cta">Cliquer pour réserver →</div>
    </div>
  `).join('');
}

// ── Select Court → show booking panel ─────────────
(window as any).selectCourt = function (id: string) {
    selectedCourtId = id;
    selectedSlots.clear();
    renderCourts();
    renderBookingPanel();
    // Scroll to panel
    setTimeout(() => $bookingPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
};

(window as any).closePanel = function () {
    selectedCourtId = null;
    selectedSlots.clear();
    $bookingPanel.innerHTML = '';
    renderCourts();
};

function renderBookingPanel() {
    const court = courts.find(c => c.id === selectedCourtId);
    if (!court) { $bookingPanel.innerHTML = ''; return; }

    // Default date = today
    if (!selectedDate) {
        const today = new Date();
        selectedDate = today.toISOString().slice(0, 10);
    }

    $bookingPanel.innerHTML = `
    <div class="booking-panel">
      <div class="panel-header">
        <div class="panel-court-info">
          <div class="panel-court-icon ${court.sport}">${court.sport === 'padel' ? '🏸' : '⚽'}</div>
          <div>
            <div class="panel-court-name">${court.name}</div>
            <div class="panel-court-sport">${court.sport === 'padel' ? 'Padel' : 'Football'} — ${court.price_per_hour} DA/h</div>
          </div>
        </div>
        <button class="panel-close" onclick="window.closePanel()">✕</button>
      </div>

      <div class="name-group">
        <label>👤 Nom du réservant</label>
        <input class="name-input" id="booker-name" type="text"
               placeholder="Votre nom complet…"
               value="${localStorage.getItem('bookerName') || ''}" />
      </div>

      <div class="name-group">
        <label>📞 Numéro de téléphone (8 chiffres)</label>
        <input class="name-input" id="booker-phone" type="tel"
               placeholder="05 / 06 / 07..."
               pattern="\\d{8}"
               maxlength="8"
               value="${localStorage.getItem('bookerPhone') || ''}" />
      </div>

      <div class="date-row">
        <div class="date-group">
          <label>📅 Date</label>
          <input class="date-input" id="slot-date" type="date"
                 value="${selectedDate}"
                 min="${new Date().toISOString().slice(0, 10)}"
                 onchange="window.onDateChange(this.value)" />
        </div>
      </div>

      <div class="slots-section">
        <div class="slots-label">⏰ Choisissez vos créneaux (cliquez pour cocher)</div>
        <div class="slots-grid" id="slots-grid"></div>
      </div>

      <div id="booking-summary"></div>

      <button class="btn btn-primary" id="book-btn" onclick="window.submitBooking()">
        Confirmer la réservation
      </button>
    </div>
  `;

    loadSlots();
}

(window as any).onDateChange = function (val: string) {
    selectedDate = val;
    selectedSlots.clear();
    loadSlots();
};

// ── Load booked slots for selected court+date ─────
async function loadSlots() {
    bookedSlots.clear();
    try {
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('start_time, end_time')
            .eq('court_id', selectedCourtId)
            .neq('status', 'cancelled');

        if (error) throw error;

        bookings?.forEach((b: any) => {
            const bStart = new Date(b.start_time);
            const bEnd = new Date(b.end_time);
            const bDate = bStart.toISOString().slice(0, 10);
            if (bDate !== selectedDate) return;
            // Mark each hour as booked
            for (let h = bStart.getHours(); h < bEnd.getHours(); h++) {
                bookedSlots.add(h);
            }
        });
    } catch (e) { /* silent */ }

    renderSlots();
}

function renderSlots() {
    const grid = document.getElementById('slots-grid');
    if (!grid) return;

    let html = '';
    for (let h = 8; h <= 22; h++) {
        const isBooked = bookedSlots.has(h);
        const isSelected = selectedSlots.has(h);
        const cls = isBooked ? 'slot booked' : (isSelected ? 'slot selected' : 'slot');
        html += `
      <div class="${cls}" onclick="${isBooked ? '' : `window.toggleSlot(${h})`}">
        <span class="slot-label">${fmtHour(h)} - ${fmtHour(h + 1)}</span>
        <span class="slot-check">✓</span>
      </div>`;
    }
    grid.innerHTML = html;
    updateSummary();
}

(window as any).toggleSlot = function (h: number) {
    if (selectedSlots.has(h)) {
        selectedSlots.delete(h);
    } else {
        selectedSlots.add(h);
    }
    renderSlots();
};

function updateSummary() {
    const sumDiv = document.getElementById('booking-summary');
    if (!sumDiv) return;

    if (selectedSlots.size === 0) {
        sumDiv.innerHTML = '';
        return;
    }

    const court = courts.find(c => c.id === selectedCourtId);
    const sorted = [...selectedSlots].sort((a, b) => a - b);
    const total = selectedSlots.size * (court?.price_per_hour || 0);

    sumDiv.innerHTML = `
    <div class="booking-summary">
      <div>
        <div class="summary-text">✅ ${selectedSlots.size} créneau(x) sélectionné(s)</div>
        <div class="summary-detail">${sorted.map(h => `${fmtHour(h)}-${fmtHour(h + 1)}`).join(', ')} — Total: ${total} DA</div>
      </div>
    </div>`;
}

// ── Submit Booking ────────────────────────────────
(window as any).submitBooking = async function () {
    if (selectedSlots.size === 0) return toast('Sélectionnez au moins un créneau', 'error');

    const nameInput = document.getElementById('booker-name') as HTMLInputElement;
    const phoneInput = document.getElementById('booker-phone') as HTMLInputElement;
    const bookerName = nameInput?.value.trim();
    const bookerPhone = phoneInput?.value.trim();

    if (!bookerName) return toast('Entrez votre nom', 'error');
    if (!bookerPhone) return toast('Entrez votre numéro de téléphone', 'error');
    if (!/^\\d{8}$/.test(bookerPhone)) return toast('Le numéro doit contenir exactement 8 chiffres', 'error');

    // Save for later
    localStorage.setItem('bookerName', bookerName);
    localStorage.setItem('bookerPhone', bookerPhone);

    const btn = document.getElementById('book-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Réservation en cours…';

    const sorted = [...selectedSlots].sort((a, b) => a - b);

    // Group consecutive slots into ranges
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0] + 1;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === end) {
            end = sorted[i] + 1;
        } else {
            ranges.push([start, end]);
            start = sorted[i];
            end = sorted[i] + 1;
        }
    }
    ranges.push([start, end]);

    let allOk = true;
    for (const [s, e] of ranges) {
        const startISO = new Date(`${selectedDate}T${fmtHour(s)}:00`).toISOString();
        const endISO = new Date(`${selectedDate}T${fmtHour(e)}:00`).toISOString();

        // Use RPC for conflict-safe booking
        const { error } = await supabase.rpc('book_court_v2', {
            p_court_id: selectedCourtId,
            p_user_name: bookerName,
            p_user_phone: bookerPhone,
            p_start_time: startISO,
            p_end_time: endISO
        });

        if (error) {
            toast(`⚠️ Erreur: ${error.message}`, 'error');
            allOk = false;
        }
    }

    if (allOk) {
        toast('✅ Réservation confirmée !', 'success');
        selectedSlots.clear();
    }

    btn.disabled = false;
    btn.textContent = 'Confirmer la réservation';
    loadSlots();
};

// ── Load Bookings ─────────────────────────────────
async function loadBookings() {
    try {
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*, courts(name, sport)')
            .order('start_time', { ascending: true });

        if (error) throw error;
        renderBookings(bookings || []);
    } catch { toast('Erreur de chargement', 'error'); }
}

function renderBookings(bookings: any[]) {
    if (!bookings.length) {
        $bookingsList.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>Aucune réservation pour le moment</p></div>`;
        return;
    }
    $bookingsList.innerHTML = bookings.map(b => {
        const sport = b.courts?.sport ?? '';
        return `
    <div class="booking-card">
      <div class="booking-left">
        <div class="booking-icon ${sport}">${sport === 'padel' ? '🏸' : '⚽'}</div>
        <div class="booking-info">
          <h3>${b.courts?.name ?? 'Terrain'}</h3>
          <div class="booking-meta">
            <span class="booking-time">🕐 ${fmtDate(b.start_time)} → ${fmtDate(b.end_time)}</span>
            ${b.user_name ? `<span class="booking-person">👤 ${b.user_name}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="booking-right">
        <span class="status-badge ${b.status}">${b.status}</span>
        ${b.status === 'confirmed' ? `<button class="btn btn-danger" onclick="window.cancelBooking('${b.id}')">Annuler</button>` : ''}
      </div>
    </div>`;
    }).join('');
}

// ── Cancel Booking ────────────────────────────────
(window as any).cancelBooking = async function (id: string) {
    if (!confirm('Annuler cette réservation ?')) return;
    try {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', id);

        if (error) throw error;
        toast('Réservation annulée', 'info');
        loadBookings();
    } catch { toast('Erreur réseau', 'error'); }
};

// ── Init ──────────────────────────────────────────
loadCourts();
