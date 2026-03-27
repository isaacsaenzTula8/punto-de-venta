-- Crea estructura minima para seguridad + caja + ventas.
-- Este script complementa el esquema principal existente.

CREATE TABLE IF NOT EXISTS cash_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opening_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
    closing_amount DECIMAL(10, 2) CHECK (closing_amount >= 0),
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_status ON cash_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at);

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS cash_session_id INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cash_session ON sales(cash_session_id);
