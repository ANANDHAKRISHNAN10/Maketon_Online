/**
 * Prisma Seed Entrypoint (prisma/seed.ts)
 * Run via: npx tsx prisma/seed.ts
 *
 * Seeds:
 * - 1 Admin account (admin@brightloop.gg)
 * - 1 Staff account (staff@brightloop.gg)
 * - 5 Gamer accounts (alex@gamer.gg, maya@gamer.gg, liam@gamer.gg, sofia@gamer.gg, noah@gamer.gg)
 * - 3 Gaming plans (Daily Gem Pass, Monthly Champion Tier, Annual Legend Pass)
 * - 4 Products & 8 Variants
 * - 1 Active subscription without an invoice (Maya Lin)
 * - 1 Successful unlinked payment of $49.99 (Sofia Rossi)
 * - Duplicate invoices & expired discount on draft invoice for leakage detection
 * - 2 Security events: Card-testing bot attack & Geo-IP jump with 48-hour trade lock
 */

import { seedDatabase } from '../src/server/db';

async function main() {
  console.log('Seeding Brightloop Gaming database...');
  seedDatabase(true);
  console.log('Brightloop Gaming seed completed successfully.');
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
