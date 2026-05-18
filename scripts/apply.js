const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const TRACKERS_DIR = path.join(ROOT, "trackers");
const DRAFTS_DIR = path.join(TRACKERS_DIR, "drafts");
const EMAIL_DRAFTS_DIR = path.join(DRAFTS_DIR, "emails");
const JOBS_JSON = path.join(DATA_DIR, "jobs.json");
const PROFILE_JSON = path.join(DATA_DIR, "profile.json");
const COOKIES_PATH = path.join(DATA_DIR, "linkedin_cookies.json");
const RESUME_PDF = path.join(ROOT, "resumes", "resume.pdf");

function readJson(fp, fallback) {
  if (!fs.existsSync(fp)) return fallback;
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function writeJson(fp, value) {
  fs.writeFileSync(fp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadProfile() {
  if (!fs.existsSync(PROFILE_JSON)) {
    console.error("Missing data/profile.json — fill in your personal details first.");
    process.exit(1);
  }
  return readJson(PROFILE_JSON, {});
}

function pause(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

function extractEmail(text) {
  const match = String(text || "").match(/\b[A-Za-z0-9._%+-]+@(?!rozee|linkedin|indeed|wellfound|gmail\.com|yahoo\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return match ? match[0] : null;
}

function updateJobStatus(jobId, status) {
  const jobs = readJson(JOBS_JSON, []);
  const job = jobs.find((j) => j.id === jobId);
  if (job) {
    job.status = status;
    job.appliedAt = new Date().toISOString();
    writeJson(JOBS_JSON, jobs);
  }
}

function buildCoverNote(job, profile) {
  const reasons = job.matchReasons.filter((r) => !r.startsWith("penalty")).slice(0, 3).join(", ")
    || "the role aligns with my AI/ML background";
  const projects = (profile.projects || []).slice(0, 3).map((p) => `- ${p}`).join("\n");
  return `Hi ${job.company} Team,

I came across the ${job.title} position and I am excited to apply. ${profile.coverIntro}

Your role stood out because: ${reasons}.

Key projects:
${projects}

I would love to contribute strong implementation skills and genuine enthusiasm for AI/ML to your team. Please find my resume attached.

Best regards,
${profile.name}
${profile.university}
${profile.email}`;
}

// ─── Email Draft Generator ────────────────────────────────────────────────────

function generateEmailDraft(job, profile) {
  fs.mkdirSync(EMAIL_DRAFTS_DIR, { recursive: true });
  const contactEmail = extractEmail(`${job.description} ${job.requirements}`);
  const body = buildCoverNote(job, profile);
  const subject = `Application for ${job.title} — ${profile.name} (CS Student, FAST NUCES)`;

  const content = [
    `To: ${contactEmail || "FILL_IN_HR_EMAIL@company.com"}`,
    `Subject: ${subject}`,
    "",
    body,
    "",
    "---",
    `Job URL: ${job.url}`,
    `Score: ${job.score} | Source: ${job.source}`,
    contactEmail
      ? `Contact email found in job listing: ${contactEmail}`
      : "No email found in job description — send to company HR/contact page.",
  ].join("\n");

  const fileName = `email_${job.id}.md`;
  const filePath = path.join(EMAIL_DRAFTS_DIR, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  return { filePath, contactEmail, subject, body, to: contactEmail };
}

// ─── LinkedIn Easy Apply ──────────────────────────────────────────────────────

async function ensureLinkedInLogin(page, context) {
  await page.waitForTimeout(2000);
  const loggedIn = await page.$(".global-nav__me-photo, [data-control-name='nav-settings__account-switcher-trigger']").catch(() => null);
  if (!loggedIn) {
    console.log("\nLinkedIn: Not logged in. A login page should appear in the browser.");
    console.log("Log in manually, then return here.");
    await pause("Press Enter once you are logged in to LinkedIn...");
    const cookies = await context.cookies();
    writeJson(COOKIES_PATH, cookies);
    console.log("Cookies saved for future runs.");
  }
}

async function fillStep(page, job, profile) {
  await page.waitForTimeout(800);

  // Phone number
  const phoneInput = await page.$("input[id*='phoneNumber'], input[name*='phone'], input[type='tel']").catch(() => null);
  if (phoneInput) {
    const current = await phoneInput.inputValue().catch(() => "");
    if (!current) await phoneInput.fill(profile.phone || "");
  }

  // Resume upload
  const fileInput = await page.$("input[type='file']").catch(() => null);
  if (fileInput && fs.existsSync(RESUME_PDF)) {
    await fileInput.setInputFiles(RESUME_PDF);
    await page.waitForTimeout(1000);
  }

  // Cover letter textarea
  const coverArea = await page.$([
    "textarea[id*='cover']",
    "textarea[placeholder*='cover']",
    "textarea[placeholder*='Cover']",
    ".jobs-easy-apply-form-section__grouping textarea",
  ].join(", ")).catch(() => null);
  if (coverArea) {
    const current = await coverArea.inputValue().catch(() => "");
    if (!current || current.length < 20) {
      await coverArea.fill(buildCoverNote(job, profile));
    }
  }

  // City / location field
  const cityInput = await page.$("input[id*='city'], input[placeholder*='City']").catch(() => null);
  if (cityInput) {
    const current = await cityInput.inputValue().catch(() => "");
    if (!current) await cityInput.fill("Karachi");
  }
}

async function linkedinApply(job, profile, browser) {
  console.log(`\n→ Applying: ${job.title} @ ${job.company}`);
  console.log(`  URL: ${job.url}`);

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  });

  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = readJson(COOKIES_PATH, []);
    if (cookies.length) await context.addCookies(cookies);
  }

  const page = await context.newPage();

  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await ensureLinkedInLogin(page, context);

    // Re-navigate to job if we had to log in
    const currentUrl = page.url();
    if (!currentUrl.includes("linkedin.com/jobs/view")) {
      await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    // Click Easy Apply
    const easyApplyBtn = await page.$([
      "button.jobs-apply-button",
      "button[aria-label*='Easy Apply']",
      "button:has-text('Easy Apply')",
    ].join(", ")).catch(() => null);

    if (!easyApplyBtn) {
      console.log("  Easy Apply not available — external application required. Skipping.");
      await context.close();
      return "skipped";
    }

    await easyApplyBtn.click();
    await page.waitForTimeout(1500);

    // Step through the form
    for (let step = 0; step < 10; step++) {
      await fillStep(page, job, profile);

      // Check for Review/Submit step
      const submitBtn = await page.$([
        "button[aria-label='Submit application']",
        "button:has-text('Submit application')",
      ].join(", ")).catch(() => null);

      if (submitBtn) {
        console.log("\n  ✓ REVIEW STEP — form is filled.");
        console.log("  Check the browser, review your application, then:");
        console.log("  • Press Enter here to SUBMIT");
        console.log("  • Press Ctrl+C to SKIP this job");
        await pause("  [Enter to submit / Ctrl+C to skip] → ");

        await submitBtn.click();
        await page.waitForTimeout(3000);

        updateJobStatus(job.id, "applied");
        const cookies = await context.cookies();
        writeJson(COOKIES_PATH, cookies);
        console.log(`  Applied! Status updated to "applied".`);
        await context.close();
        return "applied";
      }

      // Next button
      const nextBtn = await page.$([
        "button[aria-label='Continue to next step']",
        "button[aria-label='Review your application']",
        "button:has-text('Next')",
        "button:has-text('Review')",
      ].join(", ")).catch(() => null);

      if (nextBtn) {
        await nextBtn.click();
        await page.waitForTimeout(1200);
      } else {
        break;
      }
    }

    console.log("  Could not find Submit button — please complete manually in browser.");
    await pause("  Press Enter to continue to next job...");
  } catch (err) {
    console.warn(`  Error: ${err.message}`);
  }

  await context.close();
  return "error";
}

// ─── Gmail Draft Summary ──────────────────────────────────────────────────────

function printGmailInstructions(drafts) {
  if (!drafts.length) return;
  console.log("\n─── Email Drafts Ready ───────────────────────────────────────");
  console.log("Ask Claude to create Gmail drafts by saying:");
  console.log('  "Create Gmail drafts for all jobs in trackers/drafts/emails/"');
  console.log("\nDrafts generated:");
  for (const d of drafts) {
    const to = d.contactEmail || "no email found";
    console.log(`  • ${path.basename(d.filePath)}  →  ${to}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { sources: ["linkedin", "email"], limit: 5, headful: true };
  for (const item of argv) {
    if (item.startsWith("--source=")) args.sources = item.slice(9).split(",").map((s) => s.trim());
    if (item.startsWith("--limit=")) args.limit = Number(item.slice(8));
    if (item === "--headless") args.headful = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = loadProfile();

  fs.mkdirSync(EMAIL_DRAFTS_DIR, { recursive: true });

  const allJobs = readJson(JOBS_JSON, []);
  const eligible = allJobs
    .filter((j) => ["shortlisted", "drafted"].includes(j.status))
    .slice(0, args.limit);

  if (!eligible.length) {
    console.log("No shortlisted or drafted jobs found.");
    console.log("Run `npm run jobs:run` first to search and score jobs.");
    return;
  }

  console.log(`Found ${eligible.length} job(s) to process.\n`);

  // Email drafts for all eligible jobs
  const emailDrafts = [];
  if (args.sources.includes("email")) {
    for (const job of eligible) {
      const draft = generateEmailDraft(job, profile);
      emailDrafts.push(draft);
      console.log(`Email draft: ${path.basename(draft.filePath)}`);
      if (draft.contactEmail) console.log(`  Contact: ${draft.contactEmail}`);
      updateJobStatus(job.id, "drafted");
    }
  }

  // LinkedIn Easy Apply
  const linkedinJobs = eligible.filter((j) => j.source === "linkedin" && args.sources.includes("linkedin"));
  if (linkedinJobs.length) {
    console.log(`\nStarting LinkedIn Easy Apply for ${linkedinJobs.length} job(s)...`);
    const browser = await chromium.launch({ headless: !args.headful });
    for (const job of linkedinJobs) {
      await linkedinApply(job, profile, browser);
    }
    await browser.close();
  } else if (args.sources.includes("linkedin")) {
    console.log("No LinkedIn jobs in shortlist (run search first or check source filter).");
  }

  printGmailInstructions(emailDrafts);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
