CREATE TABLE IF NOT EXISTS system_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  multi_branch_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO system_settings (id, multi_branch_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
