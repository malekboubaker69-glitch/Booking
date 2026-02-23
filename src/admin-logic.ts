import { supabase } from './supabase.js'

// Jeton d'administration stocké localement
let token: string | null = localStorage.getItem('adminToken');

// ── Initialisation ─────────────────────────────────────────────
// Si un jeton existe, on affiche direct l'admin, sinon l'écran de connexion
if (token) {
    showAdmin();
} else {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = 'flex';
}

// ── Authentification ─────────────────────────────────────────────
// Vérification simplifiée pour le mode serverless (à remplacer par Supabase Auth idéalement)
(window as any).handleLogin = async function (e: Event) {
    e.preventDefault();
    const pwd = (document.getElementById('password') as HTMLInputElement).value;

    const ADMIN_PASSWORD = 'admin123';

    if (pwd === ADMIN_PASSWORD) {
        token = 'simple-admin-token';
        localStorage.setItem('adminToken', token);
        showAdmin();
    } else {
        alert('Mot de passe incorrect');
    }
};

(window as any).logout = function () {
    localStorage.removeItem('adminToken');
    location.reload();
};

function showAdmin() {
    const loginScreen = document.getElementById('login-screen');
    const adminApp = document.getElementById('admin-app');
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminApp) adminApp.style.display = 'block';
    loadStats();
    loadCourts();
    loadBookings();
}

(window as any).switchSection = function (id: string) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    document.getElementById(`section-${id}`)?.classList.add('active');
    (event?.target as HTMLElement).classList.add('active');
};

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Données et Statistiques ─────────────────────────────────────────────
// Calcule les stats (revenu, réservations, terrains actifs)
async function loadStats() {
    try {
        const [courtsRes, bookingsRes] = await Promise.all([
            supabase.from('courts').select('id, is_active'),
            supabase.from('bookings').select('status, start_time, end_time, court_id, courts(price_per_hour)')
        ]);

        if (courtsRes.error || bookingsRes.error) throw new Error('Stats error');

        const courts = courtsRes.data || [];
        const bookings = bookingsRes.data || [];
        const confirmed = bookings.filter((b: any) => b.status === 'confirmed');

        // Calcul du revenu total basé sur la durée et le prix/heure
        let revenue = 0;
        confirmed.forEach((b: any) => {
            const price = b.courts?.price_per_hour || 0;
            const hours = (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3600000;
            revenue += hours * price;
        });

        const statsGrid = document.getElementById('stats-grid');
        if (statsGrid) {
            statsGrid.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${Math.round(revenue)} DA</div>
                    <div class="stat-label">Revenu Confirmé</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${confirmed.length}</div>
                    <div class="stat-label">Réservations Confirmées</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${courts.filter((c: any) => c.is_active).length} / ${courts.length}</div>
                    <div class="stat-label">Terrains Actifs</div>
                </div>
            `;
        }
    } catch { console.error('Error loading stats'); }
}

async function loadCourts() {
    try {
        const { data: courts, error } = await supabase
            .from('courts')
            .select('*')
            .order('name');

        if (error) throw error;

        const list = document.getElementById('courts-list');
        if (list) {
            list.innerHTML = (courts || []).map((c: any) => `
                <div class="admin-court-card" style="${!c.is_active ? 'opacity:0.6' : ''}">
                    <div class="court-info">
                        <div class="court-icon ${c.sport}">${c.sport === 'padel' ? '🏸' : '⚽'}</div>
                        <div>
                            <div style="font-weight:700">${c.name} ${!c.is_active ? '(Inactif)' : ''}</div>
                            <div style="font-size:0.85rem; color:#666">${c.price_per_hour} DA/h</div>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn-icon" onclick='window.editCourt(${JSON.stringify(c)})'>✏️</button>
                        ${c.is_active ?
                    `<button class="btn-icon delete" onclick="window.deleteCourt('${c.id}')">🗑️</button>` :
                    `<button class="btn-icon" onclick="window.reactivateCourt('${c.id}')">🔄</button>`}
                    </div>
                </div>
            `).join('');
        }
    } catch { console.error('Error loading courts'); }
}

async function loadBookings() {
    try {
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*, courts(name, sport, price_per_hour)')
            .order('start_time', { ascending: false });

        if (error) throw error;

        const renderTable = (list: any[]) => `
            <table>
                <thead>
                    <tr>
                        <th>Client</th>
                        <th>Terrain</th>
                        <th>Date & Heure</th>
                        <th>Statut</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map(b => `
                        <tr>
                            <td>
                                <div class="client-info">
                                    <span class="client-name">${b.user_name || 'Inconnu'}</span>
                                    <span class="client-phone">${b.user_phone || 'Pas de tél'}</span>
                                </div>
                            </td>
                            <td>${b.courts?.name || 'Terrain'} (${b.courts?.sport})</td>
                            <td>${fmtDate(b.start_time)}</td>
                            <td><span class="status-badge ${b.status}">${b.status}</span></td>
                            <td>
                                ${b.status === 'confirmed' ?
                `<button class="btn-icon delete" onclick="window.cancelBooking('${b.id}')" title="Annuler">✕</button>` :
                ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const allList = document.getElementById('all-bookings-list');
        const recentList = document.getElementById('recent-bookings-list');
        if (allList) allList.innerHTML = renderTable(bookings || []);
        if (recentList) recentList.innerHTML = renderTable((bookings || []).slice(0, 5));
    } catch { console.error('Error loading bookings'); }
}

(window as any).cancelBooking = async function (id: string) {
    if (!confirm('Annuler cette réservation ?')) return;
    try {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', id);

        if (error) throw error;
        loadBookings();
        loadStats();
    } catch { alert('Erreur réseau'); }
};

// ── Actions sur les Terrains (Ajout/Modif/Désactivation) ───────────────────────────
(window as any).handleCourtSubmit = async function (e: Event) {
    e.preventDefault();
    const id = (document.getElementById('court-id') as HTMLInputElement).value;
    const name = (document.getElementById('court-name') as HTMLInputElement).value;
    const sport = (document.getElementById('court-sport') as HTMLSelectElement).value;
    const price = Number((document.getElementById('court-price') as HTMLInputElement).value);

    const body: any = { name, sport, price_per_hour: price };

    try {
        let res;
        if (id) {
            // Modification d'un terrain existant
            res = await supabase.from('courts').update(body).eq('id', id);
        } else {
            // Ajout d'un nouveau terrain
            res = await supabase.from('courts').insert({ ...body, is_active: true });
        }

        if (res.error) throw res.error;
        (window as any).closeModal();
        loadCourts();
        loadStats();
    } catch {
        alert("Erreur lors de l'enregistrement");
    }
};

(window as any).deleteCourt = async function (id: string) {
    if (!confirm('Désactiver ce terrain ?')) return;
    try {
        await supabase.from('courts').update({ is_active: false }).eq('id', id);
        loadCourts();
        loadStats();
    } catch { alert('Erreur'); }
};

(window as any).reactivateCourt = async function (id: string) {
    if (!confirm('Réactiver ce terrain ?')) return;
    try {
        await supabase.from('courts').update({ is_active: true }).eq('id', id);
        loadCourts();
        loadStats();
    } catch { alert('Erreur'); }
};

// ── Modal Logic ──────────────────────────────────────
const modal = document.getElementById('modal-overlay');

(window as any).openModal = function () {
    (document.getElementById('court-form') as HTMLFormElement).reset();
    (document.getElementById('court-id') as HTMLInputElement).value = '';
    const title = document.getElementById('modal-title');
    if (title) title.textContent = 'Ajouter un terrain';
    modal?.classList.add('open');
};

(window as any).editCourt = function (c: any) {
    (document.getElementById('court-id') as HTMLInputElement).value = c.id;
    (document.getElementById('court-name') as HTMLInputElement).value = c.name;
    (document.getElementById('court-sport') as HTMLSelectElement).value = c.sport;
    (document.getElementById('court-price') as HTMLInputElement).value = c.price_per_hour;
    const title = document.getElementById('modal-title');
    if (title) title.textContent = 'Modifier le terrain';
    modal?.classList.add('open');
};

(window as any).closeModal = function () {
    modal?.classList.remove('open');
};
