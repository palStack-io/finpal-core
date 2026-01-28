-- Add rollover fields to budgets table
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS rollover BOOLEAN DEFAULT FALSE;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS rollover_amount FLOAT DEFAULT 0.0;
