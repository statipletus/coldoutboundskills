#!/usr/bin/env tsx
// Pings every configured API. Prints ✅/⚠️/❌ status table.
// Run: npx tsx scripts/verify-credentials.ts

import { env, printTable } from "./_lib.ts";

interface Check {
  service: string;
  status: "✅" | "⚠️" | "❌";
  notes: string;
}

async function checkProspeo(): Promise<Check> {
  if (!env.PROSPEO_API_KEY) return { service: "Prospeo", status: "❌", notes: "PROSPEO_API_KEY not set" };
  try {
    // Tiny request to test auth — 1 result, no credit charge
    const r = await fetch("https://api.prospeo.io/search-person", {
      method: "POST",
      headers: { "X-KEY": env.PROSPEO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, filters: { person_location_search: { include: ["California, United States #US"] } } }),
    });
    if (r.status === 200) {
      return { service: "Prospeo", status: "✅", notes: "Auth OK" };
    }
    if (r.status === 401) return { service: "Prospeo", status: "❌", notes: "Invalid API key" };
    return { service: "Prospeo", status: "❌", notes: `HTTP ${r.status}` };
  } catch (e: any) {
    return { service: "Prospeo", status: "❌", notes: `Network error: ${e.message}` };
  }
}

async function checkSmartlead(): Promise<Check> {
  if (!env.SMARTLEAD_API_KEY) return { service: "Smartlead", status: "❌", notes: "SMARTLEAD_API_KEY not set" };
  try {
    const r = await fetch(`https://server.smartlead.ai/api/v1/campaigns?api_key=${env.SMARTLEAD_API_KEY}`);
    if (r.status === 200) {
      const j: any = await r.json();
      const count = Array.isArray(j) ? j.length : 0;
      return { service: "Smartlead", status: "✅", notes: `${count} campaigns` };
    }
    return { service: "Smartlead", status: "❌", notes: `HTTP ${r.status}` };
  } catch (e: any) {
    return { service: "Smartlead", status: "❌", notes: `Network error: ${e.message}` };
  }
}

async function checkIcypeas(): Promise<Check> {
  if (!env.ICYPEAS_API_KEY) return { service: "Icypeas", status: "❌", notes: "ICYPEAS_API_KEY not set" };
  try {
    // Zero-cost auth probe: read a non-existent search id.
    // Valid key → 200 (search_not_found). Bad key → 401. No verification credit spent.
    const r = await fetch("https://app.icypeas.com/api/bulk-single-searchs/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: env.ICYPEAS_API_KEY },
      body: JSON.stringify({ id: "auth_probe_nonexistent" }),
    });
    if (r.status === 200) return { service: "Icypeas", status: "✅", notes: "Auth OK" };
    if (r.status === 401) return { service: "Icypeas", status: "❌", notes: "Invalid API key" };
    return { service: "Icypeas", status: "❌", notes: `HTTP ${r.status}` };
  } catch (e: any) {
    return { service: "Icypeas", status: "❌", notes: `Network error: ${e.message}` };
  }
}

async function checkBlitz(): Promise<Check> {
  if (!env.BLITZ_API_KEY) return { service: "Blitz", status: "⚠️", notes: "Not configured (optional list-building)" };
  try {
    const base = env.BLITZ_BASE_URL || "https://api.blitz-api.ai";
    const r = await fetch(`${base}/v2/account/key-info`, { headers: { "x-api-key": env.BLITZ_API_KEY } });
    if (r.status === 200) {
      const j: any = await r.json();
      if (j?.valid) return { service: "Blitz", status: "✅", notes: `Credits: ${j.remaining_credits ?? "?"}` };
      return { service: "Blitz", status: "❌", notes: "Key rejected (valid=false)" };
    }
    if (r.status === 401) return { service: "Blitz", status: "❌", notes: "Invalid API key" };
    return { service: "Blitz", status: "❌", notes: `HTTP ${r.status}` };
  } catch (e: any) {
    return { service: "Blitz", status: "❌", notes: `Network error: ${e.message}` };
  }
}

async function checkZapmail(): Promise<Check> {
  if (!env.ZAPMAIL_API_KEY) return { service: "Zapmail", status: "⚠️", notes: "Not set yet (needed for inbox provisioning)" };
  try {
    const r = await fetch("https://api.zapmail.ai/api/v2/domains/assignable?limit=5&page=1", {
      headers: { "x-auth-zapmail": env.ZAPMAIL_API_KEY },
    });
    if (r.status === 200) {
      const j: any = await r.json();
      const count = j?.data?.length ?? 0;
      return { service: "Zapmail", status: "✅", notes: `${count} assignable domains visible` };
    }
    return { service: "Zapmail", status: "❌", notes: `HTTP ${r.status}` };
  } catch (e: any) {
    return { service: "Zapmail", status: "❌", notes: `Network error: ${e.message}` };
  }
}

async function main() {
  console.log("Checking credentials...\n");
  const checks = await Promise.all([
    checkProspeo(), checkSmartlead(), checkIcypeas(), checkBlitz(), checkZapmail(),
  ]);
  printTable(checks as any);
  console.log();

  // Required for a first campaign: a list source (Prospeo), a sending platform
  // (Smartlead), and email validation (Icypeas). Zapmail/Blitz are added as needed.
  const required = ["Prospeo", "Smartlead", "Icypeas"];
  const failed = checks.filter(c => c.status === "❌");
  const missingRequired = checks.filter(c => required.includes(c.service) && c.status !== "✅");

  if (failed.length > 0) {
    console.log(`❌ ${failed.length} service(s) failing. Fix before continuing.`);
    process.exit(1);
  }
  if (missingRequired.length > 0) {
    console.log(`❌ Missing required service(s): ${missingRequired.map(c => c.service).join(", ")}.`);
    process.exit(1);
  }
  console.log("✅ All required services OK. Ready to launch.");
}

main().catch(e => { console.error(e); process.exit(1); });
