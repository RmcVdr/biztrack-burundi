import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  language: text("language", { enum: ["fr", "rn"] }).notNull().default("fr"),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("accounts_email_unique").on(table.email)]);

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
});

export const shops = sqliteTable("shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("BIF"),
  createdAt: integer("created_at").notNull(),
});

export const memberships = sqliteTable("memberships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "manager", "cashier"] }).notNull(),
}, (table) => [uniqueIndex("memberships_shop_account_unique").on(table.shopId, table.accountId)]);

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purchasePrice: integer("purchase_price").notNull(),
  salePrice: integer("sale_price").notNull(),
  stock: integer("stock").notNull(),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  total: integer("total").notNull(),
  costTotal: integer("cost_total").notNull(),
  paymentMethod: text("payment_method", { enum: ["cash", "lumicash", "ecocash", "credit"] }).notNull(),
  customerName: text("customer_name"),
  createdBy: integer("created_by").notNull().references(() => accounts.id),
  createdAt: integer("created_at").notNull(),
});

export const saleItems = sqliteTable("sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  unitCost: integer("unit_cost").notNull(),
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),
  note: text("note"),
  createdBy: integer("created_by").notNull().references(() => accounts.id),
  createdAt: integer("created_at").notNull(),
});

export const debts = sqliteTable("debts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  saleId: integer("sale_id").references(() => sales.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  originalAmount: integer("original_amount").notNull(),
  balance: integer("balance").notNull(),
  status: text("status", { enum: ["open", "paid"] }).notNull().default("open"),
  createdAt: integer("created_at").notNull(),
});

export const debtPayments = sqliteTable("debt_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  debtId: integer("debt_id").notNull().references(() => debts.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  createdAt: integer("created_at").notNull(),
});
