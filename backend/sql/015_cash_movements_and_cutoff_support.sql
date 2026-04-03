-- Movimientos manuales de caja para cortes (entradas/salidas de efectivo)
CREATE TABLE IF NOT EXISTS cash_movements (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  cash_session_id INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
  movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('in', 'out')),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  reason VARCHAR(140) NOT NULL,
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_branch_id ON cash_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id ON cash_movements(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at ON cash_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(movement_type);
