-- Migration: Add email verification fields to users table
-- Date: 2026-01-17
-- Description: Adds email_verified, verification_token, and verification_token_expiry columns

-- Add email verification columns
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN verification_token VARCHAR(100);
ALTER TABLE users ADD COLUMN verification_token_expiry DATETIME;

-- Set existing users as verified (grandfather them in)
UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_reset_token ON users(reset_token);
