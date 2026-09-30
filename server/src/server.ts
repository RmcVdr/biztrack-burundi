// Serveur HTTP standalone BIZTRACK BURUNDI — remplace le worker Muse.
//
//  - POST /actions  → protocole JSON-RPC : { action, args } -> { data } | { error }
//                     (même protocole que le SDK : le client n'a pas changé de logique)
//  - GET  /*        → fichiers statiques de client/dist (build React), fallback index.html
//  - Au démarrage   → applique les migrations drizzle/*.sql si la base est vide
//
// Variables d'environnement :
//   PORT     port d'écoute (défaut 3000 ; Render injecte 10000)
//   DB_PATH  chemin du fichier SQLite (défaut ./app.db)

import { readdirSync, readFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { Actions } from "./actions";
import { createCtx, createDb, type Ctx } from "./runtime";

const PORT = Number(process.env.PORT ?? "3000");
const DB_PATH = process.env.DB_PATH ?? "./app.db";
const ROOT = process.cwd();
const CLIENT_DIST = join(ROOT, "client", "dist");
const DRIZZLE_DIR = join(ROOT, "drizzle");

// ---------------------------------------------------------------------------
// Base de données + migrations
// ---------------------------------------------------------------------------

const { sqlite, db } = createDb(DB_PATH);
const ctx = createCtx(db);

function tableExists(name: string): boolean {
  const row = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | null;
  return row !== null;
}

function applyMigrations(): void {
  if (tableExists("accounts")) {
    console.log(`[db] schéma déjà présent (${DB_PATH})`);
    return;
  }
  console.log(`[db] initialisation du schéma (${DB_PATH})…`);
  const files = readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(DRIZZLE_DIR, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) sqlite.exec(statement);
    console.log(`[db] migration appliquée : ${file}`);
  }
}

applyMigrations();

// ---------------------------------------------------------------------------
// API : POST /actions
// ---------------------------------------------------------------------------

type ActionDef = {
  request: { parse: (v: unknown) => unknown };
  response: { parse: (v: unknown) => unknown };
  handler: (ctx: Ctx, args: any) => Promise<unknown>;
};

const registry = Actions as unknown as Record<string, ActionDef>;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function handleAction(req: Request): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide." }, 400);
  }
  const def = registry?.[body?.action];
  if (!def) return json({ error: `Action inconnue : ${String(body?.action)}` }, 404);

  let args: unknown;
  try {
    args = def.request.parse(body.args ?? {});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: `Arguments invalides : ${message}` }, 400);
  }

  try {
    const data = await def.handler(ctx, args);
    return json({ data: def.response.parse(data) });
  } catch (e) {
    // Erreurs métier (ex. "Stock insuffisant…") : message transmis tel quel,
    // comme le faisait le worker Muse.
    return json({ error: e instanceof Error ? e.message : "Échec de l’action." });
  }
}

// ---------------------------------------------------------------------------
// Fichiers statiques (build React)
// ---------------------------------------------------------------------------

function safePath(pathname: string): string | null {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
  const full = normalize(join(CLIENT_DIST, rel));
  if (!full.startsWith(CLIENT_DIST + sep) && full !== CLIENT_DIST) return null;
  return full;
}

async function serveStatic(pathname: string): Promise<Response> {
  const full = safePath(pathname);
  if (full) {
    const file = Bun.file(full);
    if (await file.exists()) return new Response(file);
  }
  // Fallback SPA : toute route inconnue sert index.html
  return new Response(Bun.file(join(CLIENT_DIST, "index.html")));
}

// ---------------------------------------------------------------------------

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/actions" && req.method === "POST") {
      return handleAction(req);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[biztrack] en écoute sur http://localhost:${PORT} (base: ${DB_PATH})`);
