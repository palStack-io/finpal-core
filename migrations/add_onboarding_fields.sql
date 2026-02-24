-- Migration: Add onboarding and notification preference fields to users table
-- Date: 2024-12-25

-- Add onboarding flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT FALSE;

-- Add notification preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_push BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_budget_alerts BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_transaction_alerts BOOLEAN DEFAULT FALSE;

-- Create index for faster onboarding checks
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(has_completed_onboarding);

-- Update existing users to have completed onboarding (backward compatibility)
UPDATE users SET has_completed_onboarding = TRUE WHERE has_completed_onboarding IS NULL OR has_completed_onboarding = FALSE;
