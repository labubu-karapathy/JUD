#!/usr/bin/env node
/**
 * Jadavpur Love Birds (JLB) - Admin WebAuthn Bootstrap Script
 * Generates an initial cryptographic challenge and configuration for
 * hardware passkey enrollment (YubiKey, Windows Hello, TouchID).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('='.repeat(70));
console.log('  JADAVPUR LOVE BIRDS (JLB) — ADMIN BOOTSTRAP GENERATOR');
console.log('='.repeat(70));

// 1. Generate 32-byte cryptographic random challenge
const challengeBuffer = crypto.randomBytes(32);
const challengeBase64 = challengeBuffer.toString('base64url');
const adminId = crypto.randomUUID();
const timestamp = new Date().toISOString();

const bootstrapConfig = {
  challenge: challengeBase64,
  adminId,
  rpName: 'Jadavpur Love Birds Admin',
  rpId: 'localhost',
  createdAt: timestamp,
  status: 'PENDING_REGISTRATION',
};

const outputDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'admin-bootstrap.json');
fs.writeFileSync(outputPath, JSON.stringify(bootstrapConfig, null, 2), 'utf-8');

console.log('\n[+] Generated Initial WebAuthn Challenge:');
console.log(`    Challenge:   ${challengeBase64}`);
console.log(`    Admin ID:    ${adminId}`);
console.log(`    Created:     ${timestamp}`);
console.log(`    Saved to:    ${outputPath}\n`);
console.log('[*] To enroll your hardware passkey:');
console.log('    1. Start the dev server: npm run dev');
console.log('    2. Open: http://localhost:5173/#/admin');
console.log('    3. Tap "Enroll Hardware Passkey" or "Register Device"');
console.log('='.repeat(70));
