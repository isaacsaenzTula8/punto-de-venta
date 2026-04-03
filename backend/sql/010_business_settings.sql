CREATE TABLE IF NOT EXISTS business_settings (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  business_name VARCHAR(160) NOT NULL DEFAULT 'Mi Negocio',
  nit VARCHAR(40),
  phone VARCHAR(40),
  address TEXT,
  currency_code VARCHAR(8) NOT NULL DEFAULT 'GTQ',
  logo_url TEXT,
  use_dark_mode BOOLEAN NOT NULL DEFAULT false,
  primary_color VARCHAR(7) NOT NULL DEFAULT '#0F172A',
  accent_color VARCHAR(7) NOT NULL DEFAULT '#1D4ED8',
  section_borders BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_settings_branch_unique
ON business_settings(branch_id);

INSERT INTO business_settings (
  branch_id,
  business_name,
  currency_code,
  use_dark_mode,
  primary_color,
  accent_color,
  section_borders
)
VALUES (1, 'Mi Negocio', 'GTQ', false, '#0F172A', '#1D4ED8', true)
ON CONFLICT (branch_id) DO NOTHING;
