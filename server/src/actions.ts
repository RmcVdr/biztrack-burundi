import { z } from "zod";
import { defineAction, type ActionsModule, type Ctx } from "./runtime";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";

const roleSchema = z.enum(["owner", "manager", "cashier"]);
const paymentSchema = z.enum(["cash", "lumicash", "ecocash", "credit"]);
const productSchema = z.object({ id: z.number(), name: z.string(), purchasePrice: z.number(), salePrice: z.number(), stock: z.number(), lowStockThreshold: z.number(), createdAt: z.number(), updatedAt: z.number() });
const saleItemSchema = z.object({ id: z.number(), productId: z.number(), productName: z.string(), quantity: z.number(), unitPrice: z.number(), unitCost: z.number() });
const saleSchema = z.object({ id: z.number(), total: z.number(), costTotal: z.number(), paymentMethod: paymentSchema, customerName: z.string().nullable(), createdAt: z.number(), items: z.array(saleItemSchema) });
const expenseSchema = z.object({ id: z.number(), label: z.string(), amount: z.number(), note: z.string().nullable(), createdAt: z.number() });
const debtPaymentSchema = z.object({ id: z.number(), amount: z.number(), createdAt: z.number() });
const debtSchema = z.object({ id: z.number(), saleId: z.number().nullable(), customerName: z.string(), originalAmount: z.number(), balance: z.number(), status: z.enum(["open", "paid"]), createdAt: z.number(), payments: z.array(debtPaymentSchema) });
const shopSchema = z.object({ id: z.number(), name: z.string(), currency: z.string(), role: roleSchema });
const memberSchema = z.object({ id: z.number(), name: z.string(), email: z.string(), role: roleSchema });
const stateSchema = z.object({ account: z.object({ id: z.number(), name: z.string(), email: z.string(), language: z.enum(["fr", "rn"]) }), shops: z.array(shopSchema), activeShopId: z.number(), products: z.array(productSchema), sales: z.array(saleSchema), expenses: z.array(expenseSchema), debts: z.array(debtSchema), members: z.array(memberSchema), syncedAt: z.number() });

const toHex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => new Uint8Array(value.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" }, key, 256);
  return `${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}
async function verifyPassword(password: string, stored: string) {
  const [saltHex = "", expectedHex = ""] = stored.split(":");
  if (!saltHex || !expectedHex) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromHex(saltHex), iterations: 120_000, hash: "SHA-256" }, key, 256);
  const actual = toHex(new Uint8Array(bits));
  if (actual.length !== expectedHex.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expectedHex.charCodeAt(index);
  return difference === 0;
}

async function authenticate(ctx: Ctx, token: string) {
  const db = ctx.db;
  const found = await db.select({ account: schema.accounts }).from(schema.sessions).innerJoin(schema.accounts, eq(schema.sessions.accountId, schema.accounts.id)).where(eq(schema.sessions.token, token)).limit(1);
  const row = found[0];
  if (!row) throw new Error("Session expirée. Reconnectez-vous.");
  return row.account;
}

async function requireMembership(ctx: Ctx, accountId: number, shopId: number, allowed?: Array<"owner" | "manager" | "cashier">) {
  const db = ctx.db;
  const rows = await db.select().from(schema.memberships).where(and(eq(schema.memberships.accountId, accountId), eq(schema.memberships.shopId, shopId))).limit(1);
  const membership = rows[0];
  if (!membership) throw new Error("Vous n’avez pas accès à cette boutique.");
  if (allowed && !allowed.includes(membership.role)) throw new Error("Votre rôle ne permet pas cette action.");
  return membership;
}

async function addDemoData(ctx: Ctx, shopId: number, accountId: number) {
  const db = ctx.db;
  const now = Date.now();
  await db.insert(schema.products).values([
    { shopId, name: "Riz 1 kg", purchasePrice: 3200, salePrice: 4000, stock: 24, lowStockThreshold: 6, createdAt: now, updatedAt: now },
    { shopId, name: "Huile 1 L", purchasePrice: 6500, salePrice: 7800, stock: 3, lowStockThreshold: 5, createdAt: now, updatedAt: now },
    { shopId, name: "Sucre 1 kg", purchasePrice: 3600, salePrice: 4400, stock: 18, lowStockThreshold: 5, createdAt: now, updatedAt: now },
    { shopId, name: "Savon", purchasePrice: 1100, salePrice: 1500, stock: 0, lowStockThreshold: 4, createdAt: now, updatedAt: now },
    { shopId, name: "Eau 1,5 L", purchasePrice: 900, salePrice: 1200, stock: 31, lowStockThreshold: 8, createdAt: now, updatedAt: now },
  ]);
  await db.insert(schema.expenses).values({ shopId, label: "Transport", amount: 12000, note: "Approvisionnement", createdBy: accountId, createdAt: now - 45 * 60 * 1000 });
}

export const Actions = {
  createAccount: defineAction({
    request: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email(), password: z.string().min(6).max(100), shopName: z.string().trim().min(2).max(100), includeDemo: z.boolean().default(true) }),
    response: z.object({ token: z.string(), shopId: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db;
      const email = args.email.toLowerCase();
      const duplicate = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.email, email)).limit(1);
      if (duplicate.length) throw new Error("Un compte existe déjà avec cette adresse.");
      const hash = await hashPassword(args.password);
      const accountRows = await db.insert(schema.accounts).values({ name: args.name, email, passwordHash: hash, language: "fr", createdAt: Date.now() }).returning({ id: schema.accounts.id });
      const account = accountRows[0];
      if (!account) throw new Error("Impossible de créer le compte.");
      const shopRows = await db.insert(schema.shops).values({ name: args.shopName, currency: "BIF", createdAt: Date.now() }).returning({ id: schema.shops.id });
      const shop = shopRows[0];
      if (!shop) throw new Error("Impossible de créer la boutique.");
      await db.insert(schema.memberships).values({ shopId: shop.id, accountId: account.id, role: "owner" });
      const token = crypto.randomUUID();
      await db.insert(schema.sessions).values({ token, accountId: account.id, createdAt: Date.now() });
      if (args.includeDemo) await addDemoData(ctx, shop.id, account.id);
      ctx.invalidateQueries();
      return { token, shopId: shop.id };
    },
  }),

  login: defineAction({
    request: z.object({ email: z.string().trim().email(), password: z.string().min(1) }),
    response: z.object({ token: z.string(), shopId: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db;
      const rows = await db.select().from(schema.accounts).where(eq(schema.accounts.email, args.email.toLowerCase())).limit(1);
      const account = rows[0];
      if (!account || !(await verifyPassword(args.password, account.passwordHash))) throw new Error("Adresse ou mot de passe incorrect.");
      const memberships = await db.select().from(schema.memberships).where(eq(schema.memberships.accountId, account.id)).orderBy(asc(schema.memberships.id)).limit(1);
      const membership = memberships[0];
      if (!membership) throw new Error("Aucune boutique n’est liée à ce compte.");
      const token = crypto.randomUUID();
      await db.insert(schema.sessions).values({ token, accountId: account.id, createdAt: Date.now() });
      return { token, shopId: membership.shopId };
    },
  }),

  logout: defineAction({
    request: z.object({ token: z.string().min(1) }), response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) { const db = ctx.db; await db.delete(schema.sessions).where(eq(schema.sessions.token, args.token)); return { ok: true }; },
  }),

  getState: defineAction({
    request: z.object({ token: z.string().min(1), shopId: z.number().int().positive().optional() }), response: stateSchema,
    async handler(ctx, args) {
      const db = ctx.db;
      const account = await authenticate(ctx, args.token);
      const memberships = await db.select({ id: schema.memberships.id, shopId: schema.memberships.shopId, role: schema.memberships.role, name: schema.shops.name, currency: schema.shops.currency }).from(schema.memberships).innerJoin(schema.shops, eq(schema.memberships.shopId, schema.shops.id)).where(eq(schema.memberships.accountId, account.id)).orderBy(asc(schema.shops.name));
      const chosen = memberships.find((m) => m.shopId === args.shopId) ?? memberships[0];
      if (!chosen) throw new Error("Aucune boutique disponible.");
      const [products, saleRows, itemRows, expenses, debtRows, paymentRows, memberRows] = await Promise.all([
        db.select().from(schema.products).where(eq(schema.products.shopId, chosen.shopId)).orderBy(asc(schema.products.name)),
        db.select().from(schema.sales).where(eq(schema.sales.shopId, chosen.shopId)).orderBy(desc(schema.sales.createdAt)).limit(300),
        db.select().from(schema.saleItems).where(inArray(schema.saleItems.saleId, (await db.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.shopId, chosen.shopId))).map((s) => s.id))),
        db.select().from(schema.expenses).where(eq(schema.expenses.shopId, chosen.shopId)).orderBy(desc(schema.expenses.createdAt)).limit(300),
        db.select().from(schema.debts).where(eq(schema.debts.shopId, chosen.shopId)).orderBy(desc(schema.debts.createdAt)).limit(200),
        db.select().from(schema.debtPayments),
        db.select({ id: schema.accounts.id, name: schema.accounts.name, email: schema.accounts.email, role: schema.memberships.role }).from(schema.memberships).innerJoin(schema.accounts, eq(schema.memberships.accountId, schema.accounts.id)).where(eq(schema.memberships.shopId, chosen.shopId)).orderBy(asc(schema.accounts.name)),
      ]);
      return {
        account: { id: account.id, name: account.name, email: account.email, language: account.language },
        shops: memberships.map((m) => ({ id: m.shopId, name: m.name, currency: m.currency, role: m.role })),
        activeShopId: chosen.shopId,
        products: products.map((p) => ({ id: p.id, name: p.name, purchasePrice: p.purchasePrice, salePrice: p.salePrice, stock: p.stock, lowStockThreshold: p.lowStockThreshold, createdAt: p.createdAt, updatedAt: p.updatedAt })),
        sales: saleRows.map((s) => ({ id: s.id, total: s.total, costTotal: s.costTotal, paymentMethod: s.paymentMethod, customerName: s.customerName, createdAt: s.createdAt, items: itemRows.filter((i) => i.saleId === s.id).map((i) => ({ id: i.id, productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, unitCost: i.unitCost })) })),
        expenses: expenses.map((e) => ({ id: e.id, label: e.label, amount: e.amount, note: e.note, createdAt: e.createdAt })),
        debts: debtRows.map((d) => ({ id: d.id, saleId: d.saleId, customerName: d.customerName, originalAmount: d.originalAmount, balance: d.balance, status: d.status, createdAt: d.createdAt, payments: paymentRows.filter((p) => p.debtId === d.id).map((p) => ({ id: p.id, amount: p.amount, createdAt: p.createdAt })) })),
        members: memberRows,
        syncedAt: Date.now(),
      };
    },
  }),

  createShop: defineAction({
    request: z.object({ token: z.string(), name: z.string().trim().min(2).max(100), includeDemo: z.boolean().default(false) }), response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db; const account = await authenticate(ctx, args.token); const rows = await db.insert(schema.shops).values({ name: args.name, currency: "BIF", createdAt: Date.now() }).returning({ id: schema.shops.id }); const shop = rows[0]; if (!shop) throw new Error("Impossible de créer la boutique."); await db.insert(schema.memberships).values({ shopId: shop.id, accountId: account.id, role: "owner" }); if (args.includeDemo) await addDemoData(ctx, shop.id, account.id); ctx.invalidateQueries(); return { id: shop.id }; },
  }),

  addProduct: defineAction({
    request: z.object({ token: z.string(), shopId: z.number(), name: z.string().trim().min(1).max(100), purchasePrice: z.number().int().nonnegative(), salePrice: z.number().int().nonnegative(), stock: z.number().int().nonnegative(), lowStockThreshold: z.number().int().nonnegative() }), response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db; const account = await authenticate(ctx, args.token); await requireMembership(ctx, account.id, args.shopId, ["owner", "manager"]); const now = Date.now(); const rows = await db.insert(schema.products).values({ shopId: args.shopId, name: args.name, purchasePrice: args.purchasePrice, salePrice: args.salePrice, stock: args.stock, lowStockThreshold: args.lowStockThreshold, createdAt: now, updatedAt: now }).returning({ id: schema.products.id }); const row = rows[0]; if (!row) throw new Error("Impossible d’ajouter le produit."); ctx.invalidateQueries(); return { id: row.id }; },
  }),

  updateProduct: defineAction({
    request: z.object({ token: z.string(), shopId: z.number(), id: z.number(), name: z.string().trim().min(1).max(100), purchasePrice: z.number().int().nonnegative(), salePrice: z.number().int().nonnegative(), stock: z.number().int().nonnegative(), lowStockThreshold: z.number().int().nonnegative() }), response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) { const db = ctx.db; const account = await authenticate(ctx, args.token); await requireMembership(ctx, account.id, args.shopId, ["owner", "manager"]); await db.update(schema.products).set({ name: args.name, purchasePrice: args.purchasePrice, salePrice: args.salePrice, stock: args.stock, lowStockThreshold: args.lowStockThreshold, updatedAt: Date.now() }).where(and(eq(schema.products.id, args.id), eq(schema.products.shopId, args.shopId))); ctx.invalidateQueries(); return { ok: true }; },
  }),

  deleteProduct: defineAction({
    request: z.object({ token: z.string(), shopId: z.number(), id: z.number() }), response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) { const db = ctx.db; const account = await authenticate(ctx, args.token); await requireMembership(ctx, account.id, args.shopId, ["owner"]); const linked = await db.select({ id: schema.saleItems.id }).from(schema.saleItems).where(eq(schema.saleItems.productId, args.id)).limit(1); if (linked.length) throw new Error("Ce produit figure déjà dans une vente. Modifiez son stock au lieu de le supprimer."); await db.delete(schema.products).where(and(eq(schema.products.id, args.id), eq(schema.products.shopId, args.shopId))); ctx.invalidateQueries(); return { ok: true }; },
  }),

  createSale: defineAction({
    request: z.object({ token: z.string(), shopId: z.number(), paymentMethod: paymentSchema, customerName: z.string().trim().max(100).optional(), items: z.array(z.object({ productId: z.number(), quantity: z.number().int().positive() })).min(1) }), response: z.object({ id: z.number(), total: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db; const account = await authenticate(ctx, args.token); await requireMembership(ctx, account.id, args.shopId, ["owner", "manager", "cashier"]);
      if (args.paymentMethod === "credit" && !args.customerName) throw new Error("Le nom du client est requis pour une vente à crédit.");
      const ids = args.items.map((i) => i.productId); const products = await db.select().from(schema.products).where(and(eq(schema.products.shopId, args.shopId), inArray(schema.products.id, ids)));
      let total = 0; let costTotal = 0; const lines: Array<{ product: typeof products[number]; quantity: number }> = [];
      for (const item of args.items) { const product = products.find((p) => p.id === item.productId); if (!product) throw new Error("Un produit du panier n’existe plus."); if (product.stock < item.quantity) throw new Error(`Stock insuffisant pour ${product.name}.`); total += product.salePrice * item.quantity; costTotal += product.purchasePrice * item.quantity; lines.push({ product, quantity: item.quantity }); }
      const now = Date.now(); const saleRows = await db.insert(schema.sales).values({ shopId: args.shopId, total, costTotal, paymentMethod: args.paymentMethod, customerName: args.customerName || null, createdBy: account.id, createdAt: now }).returning({ id: schema.sales.id }); const sale = saleRows[0]; if (!sale) throw new Error("Impossible d’enregistrer la vente.");
      for (const line of lines) { await db.insert(schema.saleItems).values({ saleId: sale.id, productId: line.product.id, productName: line.product.name, quantity: line.quantity, unitPrice: line.product.salePrice, unitCost: line.product.purchasePrice }); await db.update(schema.products).set({ stock: line.product.stock - line.quantity, updatedAt: now }).where(eq(schema.products.id, line.product.id)); }
      if (args.paymentMethod === "credit") await db.insert(schema.debts).values({ shopId: args.shopId, saleId: sale.id, customerName: args.customerName ?? "Client", originalAmount: total, balance: total, status: "open", createdAt: now });
      ctx.invalidateQueries(); return { id: sale.id, total };
    },
  }),

  addExpense: defineAction({
    request: z.object({ token: z.string(), shopId: z.number(), label: z.string().trim().min(2).max(100), amount: z.number().int().positive(), note: z.string().trim().max(200).optional() }), response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db; const account = await authenticate(ctx, args.token); await requireMembership(ctx, account.id, args.shopId, ["owner", "manager"]); const rows = await db.insert(schema.expenses).values({ shopId: args.shopId, label: args.label, amount: args.amount, note: args.note || null, createdBy: account.id, createdAt: Date.now() }).returning({ id: schema.expenses.id }); const row = rows[0]; if (!row) throw new Error("Impossible d’enregistrer la dépense."); ctx.invalidateQueries(); return { id: row.id }; },
  }),

  addDebtPayment: defineAction({
    request: z.object({ token: z.string(), shopId: z.number(), debtId: z.number(), amount: z.number().int().positive() }), response: z.object({ balance: z.number() }),
    async handler(ctx, args) { const db = ctx.db; const account = await authenticate(ctx, args.token); await requireMembership(ctx, account.id, args.shopId, ["owner", "manager"]); const rows = await db.select().from(schema.debts).where(and(eq(schema.debts.id, args.debtId), eq(schema.debts.shopId, args.shopId))).limit(1); const debt = rows[0]; if (!debt) throw new Error("Dette introuvable."); if (args.amount > debt.balance) throw new Error("Le paiement dépasse le solde restant."); const balance = debt.balance - args.amount; await db.insert(schema.debtPayments).values({ debtId: debt.id, amount: args.amount, createdAt: Date.now() }); await db.update(schema.debts).set({ balance, status: balance === 0 ? "paid" : "open" }).where(eq(schema.debts.id, debt.id)); ctx.invalidateQueries(); return { balance }; },
  }),

  addTeamMember: defineAction({
    request: z.object({ token: z.string(), shopId: z.number(), name: z.string().trim().min(2), email: z.string().trim().email(), password: z.string().min(6), role: z.enum(["manager", "cashier"]) }), response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db; const owner = await authenticate(ctx, args.token); await requireMembership(ctx, owner.id, args.shopId, ["owner"]); const email = args.email.toLowerCase(); let account = (await db.select().from(schema.accounts).where(eq(schema.accounts.email, email)).limit(1))[0]; if (!account) { const hash = await hashPassword(args.password); const rows = await db.insert(schema.accounts).values({ name: args.name, email, passwordHash: hash, language: "fr", createdAt: Date.now() }).returning(); account = rows[0]; } if (!account) throw new Error("Impossible de créer le membre."); const existing = await db.select().from(schema.memberships).where(and(eq(schema.memberships.accountId, account.id), eq(schema.memberships.shopId, args.shopId))).limit(1); if (existing.length) throw new Error("Cette personne appartient déjà à la boutique."); const rows = await db.insert(schema.memberships).values({ shopId: args.shopId, accountId: account.id, role: args.role }).returning({ id: schema.memberships.id }); const row = rows[0]; if (!row) throw new Error("Impossible d’ajouter le membre."); ctx.invalidateQueries(); return { id: row.id }; },
  }),
} satisfies ActionsModule;
