CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fr',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BIF',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  UNIQUE(shop_id, account_id)
);
--> statement-breakpoint
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purchase_price INTEGER NOT NULL,
  sale_price INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  cost_total INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  customer_name TEXT,
  created_by INTEGER NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  original_amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE debt_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_memberships_account ON memberships(account_id);
--> statement-breakpoint
CREATE INDEX idx_products_shop ON products(shop_id);
--> statement-breakpoint
CREATE INDEX idx_sales_shop_date ON sales(shop_id, created_at);
--> statement-breakpoint
CREATE INDEX idx_expenses_shop_date ON expenses(shop_id, created_at);
--> statement-breakpoint
CREATE INDEX idx_debts_shop ON debts(shop_id);
