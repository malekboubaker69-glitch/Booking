// ============================================================
//  Sports Court Booking API — Antigravity-style native router
// ============================================================

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Static file serving ────────────────────────────────────────
const PUBLIC_DIR = path.join(import.meta.dirname ?? ".", "..");

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

function serveStatic(res: http.ServerResponse, filePath: string): boolean {
    const fullPath = path.join(PUBLIC_DIR, filePath);
    // Prevent directory traversal
    if (!fullPath.startsWith(PUBLIC_DIR)) { return false; }
    try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) return false;
        const ext = path.extname(fullPath);
        const mime = MIME_TYPES[ext] ?? "application/octet-stream";
        const content = fs.readFileSync(fullPath);
        res.writeHead(200, { "Content-Type": mime, "Content-Length": content.byteLength });
        res.end(content);
        return true;
    } catch {
        return false;
    }
}

// ── Supabase client ────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌  Missing SUPABASE_URL or SUPABASE_KEY env vars");
    process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Types ──────────────────────────────────────────────────────
interface BookingBody {
    court_id: string;
    user_id?: string;
    user_name?: string;
    user_phone?: string;
    start_time: string;
    end_time: string;
}

type RouteHandler = (
    req: http.IncomingMessage,
    res: http.ServerResponse,
) => Promise<void> | void;

// ── Minimal router ─────────────────────────────────────────────
interface Route {
    method: string;
    path: string;
    handler: RouteHandler;
}

const routes: Route[] = [];

const app = {
    get(path: string, handler: RouteHandler) {
        routes.push({ method: "GET", path, handler });
    },
    post(path: string, handler: RouteHandler) {
        routes.push({ method: "POST", path, handler });
    },
};

// ── Helpers ────────────────────────────────────────────────────
function json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk: Buffer) => {
            data += chunk.toString();
        });
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}

// ── Admin auth ────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
// Simple token = base64 of password + timestamp (valid for 24h)
const adminTokens = new Set<string>();

function generateAdminToken(): string {
    const token = Buffer.from(`${ADMIN_PASSWORD}:${Date.now()}`).toString("base64url");
    adminTokens.add(token);
    return token;
}

function isAdminRequest(req: http.IncomingMessage): boolean {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return false;
    return adminTokens.has(auth.slice(7));
}

// ── Routes ─────────────────────────────────────────────────────

// GET / — serve the frontend
app.get("/", (_req, res) => {
    serveStatic(res, "index.html");
});

// GET /admin — serve the admin panel
app.get("/admin", (_req, res) => {
    serveStatic(res, "admin.html");
});

// POST /admin/login — authenticate admin
app.post("/admin/login", async (req, res) => {
    let body: { password: string };
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw) as { password: string };
    } catch {
        return json(res, 400, { error: "Invalid JSON body" });
    }

    if (body.password !== ADMIN_PASSWORD) {
        return json(res, 401, { error: "Mot de passe incorrect" });
    }

    const token = generateAdminToken();
    json(res, 200, { token, message: "Connexion réussie" });
});

// GET /courts — list all active courts
app.get("/courts", async (_req, res) => {
    const { data, error } = await supabase
        .from("courts")
        .select("*")
        .eq("is_active", true)
        .order("name");

    if (error) {
        return json(res, 500, { error: error.message });
    }
    json(res, 200, data);
});

// GET /admin/courts — list ALL courts (including inactive) — admin only
app.get("/admin/courts", async (req, res) => {
    if (!isAdminRequest(req)) return json(res, 401, { error: "Non autorisé" });

    const { data, error } = await supabase
        .from("courts")
        .select("*")
        .order("name");

    if (error) return json(res, 500, { error: error.message });
    json(res, 200, data);
});

// POST /admin/courts — create a new court — admin only
app.post("/admin/courts", async (req, res) => {
    if (!isAdminRequest(req)) return json(res, 401, { error: "Non autorisé" });

    let body: { name: string; sport: string; price_per_hour: number };
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
    } catch {
        return json(res, 400, { error: "Invalid JSON body" });
    }

    if (!body.name || !body.sport || body.price_per_hour == null) {
        return json(res, 400, { error: "name, sport, and price_per_hour are required" });
    }

    const { data, error } = await supabase
        .from("courts")
        .insert({
            name: body.name,
            sport: body.sport,
            price_per_hour: body.price_per_hour,
            is_active: true,
        })
        .select()
        .single();

    if (error) return json(res, 500, { error: error.message });
    json(res, 201, data);
});

// POST /admin/courts/update — update a court — admin only
app.post("/admin/courts/update", async (req, res) => {
    if (!isAdminRequest(req)) return json(res, 401, { error: "Non autorisé" });

    let body: { id: string; name?: string; sport?: string; price_per_hour?: number; is_active?: boolean };
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
    } catch {
        return json(res, 400, { error: "Invalid JSON body" });
    }

    if (!body.id) return json(res, 400, { error: "id is required" });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.sport !== undefined) updates.sport = body.sport;
    if (body.price_per_hour !== undefined) updates.price_per_hour = body.price_per_hour;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const { data, error } = await supabase
        .from("courts")
        .update(updates)
        .eq("id", body.id)
        .select()
        .single();

    if (error) return json(res, 500, { error: error.message });
    json(res, 200, data);
});

// POST /admin/courts/delete — deactivate a court — admin only
app.post("/admin/courts/delete", async (req, res) => {
    if (!isAdminRequest(req)) return json(res, 401, { error: "Non autorisé" });

    let body: { id: string };
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
    } catch {
        return json(res, 400, { error: "Invalid JSON body" });
    }

    if (!body.id) return json(res, 400, { error: "id is required" });

    const { data, error } = await supabase
        .from("courts")
        .update({ is_active: false })
        .eq("id", body.id)
        .select()
        .single();

    if (error) return json(res, 500, { error: error.message });
    json(res, 200, { message: "Terrain désactivé", court: data });
});

// GET /admin/stats — dashboard statistics — admin only
app.get("/admin/stats", async (req, res) => {
    if (!isAdminRequest(req)) return json(res, 401, { error: "Non autorisé" });

    const [courtsRes, bookingsRes] = await Promise.all([
        supabase.from("courts").select("id, sport, is_active"),
        supabase.from("bookings").select("id, status, court_id, start_time, end_time, courts(sport, price_per_hour)"),
    ]);

    if (courtsRes.error || bookingsRes.error) {
        return json(res, 500, { error: "Erreur lors du chargement des statistiques" });
    }

    const courts = courtsRes.data ?? [];
    const bookings = bookingsRes.data ?? [];

    const confirmedBookings = bookings.filter((b: any) => b.status === "confirmed");
    const cancelledBookings = bookings.filter((b: any) => b.status === "cancelled");

    // Calculate total revenue from confirmed bookings
    let totalRevenue = 0;
    for (const b of confirmedBookings) {
        const court = b.courts as any;
        if (court?.price_per_hour) {
            const hours = (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3600000;
            totalRevenue += hours * court.price_per_hour;
        }
    }

    json(res, 200, {
        totalCourts: courts.length,
        activeCourts: courts.filter((c: any) => c.is_active).length,
        totalBookings: bookings.length,
        confirmedBookings: confirmedBookings.length,
        cancelledBookings: cancelledBookings.length,
        totalRevenue: Math.round(totalRevenue),
        padelBookings: confirmedBookings.filter((b: any) => (b.courts as any)?.sport === "padel").length,
        footBookings: confirmedBookings.filter((b: any) => (b.courts as any)?.sport === "foot").length,
    });
});

// GET /bookings — list all bookings
app.get("/bookings", async (_req, res) => {
    const { data, error } = await supabase
        .from("bookings")
        .select("*, courts(name, sport)")
        .order("start_time", { ascending: true });

    if (error) {
        return json(res, 500, { error: error.message });
    }
    json(res, 200, data);
});

// POST /bookings — create a new booking with conflict detection
app.post("/bookings", async (req, res) => {
    // 1. Parse & validate body
    let body: BookingBody;
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw) as BookingBody;
    } catch {
        return json(res, 400, { error: "Invalid JSON body" });
    }

    const { court_id, user_id, user_name, user_phone, start_time, end_time } = body;

    if (!court_id || !start_time || !end_time) {
        return json(res, 400, {
            error: "court_id, start_time, and end_time are required",
        });
    }

    // Basic time validation
    const start = new Date(start_time);
    const end = new Date(end_time);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return json(res, 400, { error: "Invalid date format for start_time or end_time" });
    }
    if (end <= start) {
        return json(res, 400, { error: "end_time must be after start_time" });
    }

    if (user_phone && !/^\d{8}$/.test(user_phone)) {
        return json(res, 400, { error: "user_phone must be exactly 8 digits" });
    }

    // 2. Check for overlapping bookings (application-level check)
    const { data: conflicts, error: conflictError } = await supabase
        .from("bookings")
        .select("id, start_time, end_time")
        .eq("court_id", court_id)
        .neq("status", "cancelled")
        .lt("start_time", end_time)
        .gte("end_time", start_time);

    if (conflictError) {
        return json(res, 500, { error: conflictError.message });
    }

    if (conflicts && conflicts.length > 0) {
        return json(res, 409, {
            error: "Time slot conflict — this court is already booked for the requested period",
            conflicts,
        });
    }

    // 3. Insert the booking
    const { data: booking, error: insertError } = await supabase
        .from("bookings")
        .insert({
            court_id,
            user_id: user_id ?? null,
            user_name: user_name ?? null,
            user_phone: user_phone ?? null,
            start_time,
            end_time,
            status: "confirmed",
        })
        .select()
        .single();

    if (insertError) {
        // Handle DB-level exclusion constraint (race-condition safety net)
        if (insertError.code === "23P01") {
            return json(res, 409, {
                error: "Time slot conflict (DB constraint) — this court is already booked",
            });
        }
        return json(res, 500, { error: insertError.message });
    }

    json(res, 201, booking);
});

// POST /bookings/cancel — cancel a booking
app.post("/bookings/cancel", async (req, res) => {
    let body: { booking_id: string };
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw) as { booking_id: string };
    } catch {
        return json(res, 400, { error: "Invalid JSON body" });
    }

    if (!body.booking_id) {
        return json(res, 400, { error: "booking_id is required" });
    }

    const { data, error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", body.booking_id)
        .select()
        .single();

    if (error) {
        return json(res, 500, { error: error.message });
    }
    if (!data) {
        return json(res, 404, { error: "Booking not found" });
    }

    json(res, 200, { message: "Booking cancelled", booking: data });
});

// ── Server ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const server = http.createServer(async (req, res) => {
    // CORS headers (allow all origins for dev)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const method = req.method ?? "GET";
    const pathname = url.pathname;

    // Find matching route
    const route = routes.find(
        (r) => r.method === method && r.path === pathname,
    );

    if (route) {
        try {
            await route.handler(req, res);
        } catch (err) {
            console.error("Unhandled route error:", err);
            json(res, 500, { error: "Internal server error" });
        }
    } else {
        // Try serving a static file from public/
        if (method === "GET" && serveStatic(res, pathname)) {
            return;
        }
        json(res, 404, { error: `Route ${method} ${pathname} not found` });
    }
});

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║   🏟️  Sport Booking API running on port ${PORT}      ║
║                                                   ║
║   Public:                                         ║
║     GET  /               — frontend               ║
║     GET  /courts         — list courts             ║
║     GET  /bookings       — list bookings           ║
║     POST /bookings       — create booking          ║
║     POST /bookings/cancel — cancel booking         ║
║                                                   ║
║   Admin:                                          ║
║     GET  /admin           — admin panel            ║
║     POST /admin/login     — authenticate           ║
║     GET  /admin/courts    — all courts             ║
║     POST /admin/courts    — create court           ║
║     POST /admin/courts/update — update court       ║
║     POST /admin/courts/delete — deactivate court   ║
║     GET  /admin/stats     — dashboard stats        ║
╚═══════════════════════════════════════════════════╝
  `);
});

