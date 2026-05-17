ALTER TABLE servers ADD COLUMN proxy_type TEXT NOT NULL DEFAULT 'global';
ALTER TABLE servers ADD COLUMN proxy_host TEXT;
ALTER TABLE servers ADD COLUMN proxy_port INTEGER;
