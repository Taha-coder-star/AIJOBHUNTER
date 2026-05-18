const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const JOBS_DIR = path.join(ROOT, "jobs");
const DATA_DIR = path.join(ROOT, "data");
const TRACKERS_DIR = path.join(ROOT, "trackers");
const DRAFTS_DIR = path.join(TRACKERS_DIR, "drafts");
const RESUME_PATH = path.join(ROOT, "resumes", "resume.md");
const JOBS_JSON = path.join(DATA_DIR, "jobs.json");
const APPLICATIONS_CSV = path.join(TRACKERS_DIR, "applications.csv");

const DEFAULT_QUERIES = [
  "AI Intern",
  "Machine Learning Intern",
  "NLP Intern",
  "Data Science Intern",
  "LLM Intern",
  "Python Intern",
];

const DEFAULT_LOCATIONS = ["Karachi", "Pakistan Remote", "Remote"];
const STATUSES = new Set(["new", "shortlisted", "drafted", "applied", "rejected", "ignored"]);
const DRAFT_THRESHOLD = 75;

const SOURCES = {
  linkedin: {
    label: "LinkedIn",
    jobUrlPattern: /linkedin\.com\/jobs\/view/i,
    buildSearchUrl: (query, location) =>
      `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&f_TPR=r604800`,
  },
  indeed: {
    label: "Indeed",
    jobUrlPattern: /indeed\.[^/]+\/(?:viewjob|rc\/clk|pagead)/i,
    buildSearchUrl: (query, location) =>
      `https://pk.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&fromage=7`,
  },
  wellfound: {
    label: "Wellfound",
    jobUrlPattern: /wellfound\.com\/(?:jobs|company)\//i,
    buildSearchUrl: (query, location) =>
      `https://wellfound.com/jobs?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`,
  },
  rozee: {
    label: "Rozee",
    jobUrlPattern: /rozee\.pk\/.*jobs/i,
    buildSearchUrl: (query, location) =>
      `https://www.rozee.pk/job/jsearch/q/${encodeURIComponent(query)}/l/${encodeURIComponent(location)}`,
  },
};

const STRONG_KEYWORDS = [
  ["python", 9],
  ["machine learning", 9],
  ["artificial intelligence", 8],
  [" ai ", 5],
  ["nlp", 8],
  ["natural language processing", 8],
  ["llm", 8],
  ["large language model", 8],
  ["transformer", 8],
  ["pytorch", 7],
  ["tensorflow", 7],
  ["keras", 6],
  ["pandas", 6],
  ["anomaly detection", 8],
  ["ueba", 8],
  ["data science", 7],
];

const MEDIUM_KEYWORDS = [
  ["research", 5],
  ["backend", 4],
  ["api", 4],
  ["fastapi", 5],
  ["mongodb", 4],
  ["sql", 4],
  ["computer vision", 5],
  ["deep learning", 6],
  ["scikit", 4],
  ["hugging face", 5],
  ["jupyter", 3],
];

const NEGATIVE_KEYWORDS = [
  ["senior", -18],
  ["lead", -14],
  ["principal", -18],
  ["5+ years", -16],
  ["3+ years", -10],
  ["full-time only", -10],
  ["sales", -16],
  ["marketing", -14],
  ["digital marketing", -18],
  ["female candidates only", -20],
  ["female candidate", -16],
  ["graphic design", -14],
  ["unpaid", -8],
  ["volunteer", -8],
];

const LOCATION_RESTRICTIONS = [
  "us only",
  "u.s. only",
  "united states only",
  "must be based in the us",
  "must be based in united states",
  "eu only",
  "uk only",
  "canada only",
  "requires work authorization",
  "security clearance",
];

function ensureDirs() {
  for (const dir of [JOBS_DIR, DATA_DIR, TRACKERS_DIR, DRAFTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeSpace(value) {
  return repairText(value).replace(/\s+/g, " ").trim();
}

function repairText(value) {
  return String(value || "")
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/â€“|â€”/g, "-")
    .replace(/Â©/g, "(c)")
    .replace(/Â·/g, "-")
    .replace(/Â/g, "")
    .replace(/ÙˆØ¸Ø§Ø¦Ù[^|]+/g, "");
}

function normalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|trk|ref|from|source|campaign)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function slug(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "job";
}

function stableId(job) {
  const key = job.url || `${job.company}|${job.title}|${job.location}`;
  return crypto.createHash("sha1").update(key.toLowerCase()).digest("hex").slice(0, 12);
}

function parseArgs(argv) {
  const [command = "run", ...rest] = argv;
  const args = { command, sources: Object.keys(SOURCES), limit: 8, headful: false };
  for (const item of rest) {
    if (item.startsWith("--source=")) args.sources = item.slice(9).split(",").map((s) => s.trim()).filter(Boolean);
    if (item.startsWith("--limit=")) args.limit = Number(item.slice(8));
    if (item === "--headful") args.headful = true;
  }
  return args;
}

function sourceLabel(source) {
  return SOURCES[source]?.label || source;
}

function extractCompanyFromText(text) {
  const cleaned = repairText(text);
  const rozeeMatch = cleaned.match(/About Company\s+Share this job\s+([A-Z][A-Za-z0-9&.,' -]{2,80})\s+is offering/i);
  if (rozeeMatch) return normalizeSpace(rozeeMatch[1]);

  const lines = cleaned.split(/\n+/).map(normalizeSpace).filter(Boolean).slice(0, 35);
  const blocked = /^(apply|save|share|job|jobs|login|sign in|posted|easy apply)$/i;
  return lines.find((line) => line.length <= 80 && !blocked.test(line) && !/search free cv review/i.test(line)) || "Unknown";
}

function inferRemoteType(location, text) {
  const loc = String(location || "").toLowerCase();
  if (loc.includes("remote")) return "remote";
  if (loc.includes("karachi")) return "onsite-karachi";
  if (loc.includes("pakistan")) return "onsite-pakistan";

  const haystack = String(text || "").toLowerCase();
  if (haystack.includes("hybrid")) return "hybrid";
  if (haystack.includes("remote") || haystack.includes("work from home")) return "remote";
  return "unknown";
}

function inferLocation(text, fallback) {
  const cleaned = repairText(text);
  const jobLocation = cleaned.match(/Job Location:\s*([^\n]+?)(?:\s+Gender:|\n|$)/i);
  if (jobLocation) return normalizeSpace(jobLocation[1]);

  const cityMatch = cleaned.match(/\b(Karachi|Lahore|Islamabad|Rawalpindi|Faisalabad|Multan|Hyderabad|Remote|Pakistan)\b(?:,\s*Pakistan)?/i);
  if (cityMatch) {
    const city = normalizeSpace(cityMatch[0]);
    if (/remote/i.test(city)) return "Remote";
    if (/pakistan/i.test(city)) return city;
    return `${city}, Pakistan`;
  }

  const lines = cleaned.split(/\n+/).map(normalizeSpace).filter(Boolean).slice(0, 35);
  const locationLine = lines.find((line) =>
    /\b(remote|karachi|pakistan|lahore|islamabad|hybrid)\b/i.test(line) &&
    !/jobs in|login|sign up|post a job/i.test(line)
  );
  return locationLine || fallback || "Unknown";
}

function scoreJob(job, resumeText) {
  const text = ` ${job.title} ${job.location} ${job.remoteType} ${job.description} ${job.requirements} `.toLowerCase();
  const resume = resumeText.toLowerCase();
  let score = 20;
  const matchReasons = [];
  const missingSkills = [];

  if (/\b(intern|internship|trainee|student)\b/i.test(job.title)) {
    score += 20;
    matchReasons.push("internship/trainee role");
  }
  if (/\b(ai|machine learning|ml|data science|nlp|llm|python)\b/i.test(job.title)) {
    score += 14;
    matchReasons.push("title matches AI/ML focus");
  }
  if (/\b(remote|karachi)\b/i.test(`${job.location} ${job.remoteType}`)) {
    score += 10;
    matchReasons.push("location is Karachi/Pakistan/remote friendly");
  }
  if (/onsite-pakistan/i.test(job.remoteType) && !/karachi|remote/i.test(job.location)) {
    score -= 12;
    matchReasons.push("penalty: onsite outside Karachi");
  }

  for (const [keyword, weight] of STRONG_KEYWORDS) {
    if (text.includes(keyword)) {
      score += weight;
      if (matchReasons.length < 8) matchReasons.push(`matches ${keyword.trim()}`);
    }
  }
  for (const [keyword, weight] of MEDIUM_KEYWORDS) {
    if (text.includes(keyword)) {
      score += weight;
      if (matchReasons.length < 8) matchReasons.push(`mentions ${keyword}`);
    }
  }
  for (const [keyword, weight] of NEGATIVE_KEYWORDS) {
    if (text.includes(keyword)) {
      score += weight;
      matchReasons.push(`penalty: ${keyword}`);
    }
  }
  for (const restriction of LOCATION_RESTRICTIONS) {
    if (text.includes(restriction)) {
      score -= 18;
      matchReasons.push(`restriction: ${restriction}`);
    }
  }

  const requestedSkills = ["aws", "docker", "sql", "fastapi", "rag", "mlops", "langchain", "opencv"];
  for (const skill of requestedSkills) {
    if (text.includes(skill) && !resume.includes(skill)) missingSkills.push(skill);
  }

  score = Math.max(0, Math.min(100, score));
  const recommendedAction = score >= DRAFT_THRESHOLD
    ? "draft"
    : score >= 60
      ? "review"
      : "ignore";

  return {
    score,
    matchReasons: [...new Set(matchReasons)].slice(0, 10),
    missingSkills: [...new Set(missingSkills)].slice(0, 8),
    recommendedAction,
  };
}

function normalizeJob(input, resumeText, existing) {
  const job = {
    id: input.id,
    source: input.source || "manual",
    company: normalizeSpace(input.company) || "Unknown",
    title: normalizeSpace(input.title) || "Untitled role",
    location: normalizeSpace(input.location) || "Unknown",
    remoteType: normalizeSpace(input.remoteType) || "unknown",
    url: normalizeUrl(input.url),
    postedDate: normalizeSpace(input.postedDate),
    description: normalizeSpace(input.description),
    requirements: normalizeSpace(input.requirements),
    score: 0,
    matchReasons: [],
    missingSkills: [],
    recommendedAction: "review",
    status: existing?.status || "new",
    firstSeenAt: existing?.firstSeenAt || nowIso(),
    lastSeenAt: nowIso(),
  };
  job.remoteType = inferRemoteType(job.location, `${job.remoteType} ${job.description}`);
  job.id = job.id || stableId(job);
  Object.assign(job, scoreJob(job, resumeText));
  if (!STATUSES.has(job.status)) job.status = "new";
  if (job.score >= DRAFT_THRESHOLD && job.status === "new") job.status = "shortlisted";
  return job;
}

function mergeJobs(existingJobs, incomingJobs, resumeText) {
  const byKey = new Map();
  for (const job of existingJobs) {
    byKey.set(job.url || `${job.company}|${job.title}|${job.location}`.toLowerCase(), job);
  }

  for (const rawJob of incomingJobs) {
    const key = rawJob.url || `${rawJob.company}|${rawJob.title}|${rawJob.location}`.toLowerCase();
    const existing = byKey.get(key);
    const combined = existing
      ? {
          ...rawJob,
          company: rawJob.company || existing.company,
          title: rawJob.title || existing.title,
          location: rawJob.location || existing.location,
          remoteType: rawJob.remoteType || existing.remoteType,
          description: [existing.description, rawJob.description].filter(Boolean).join(" "),
          requirements: [existing.requirements, rawJob.requirements].filter(Boolean).join(" "),
          postedDate: rawJob.postedDate || existing.postedDate,
        }
      : rawJob;
    byKey.set(key, normalizeJob(combined, resumeText, existing));
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value || "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeTracker(jobs) {
  const columns = [
    "id",
    "status",
    "score",
    "recommendedAction",
    "source",
    "company",
    "title",
    "location",
    "remoteType",
    "url",
    "matchReasons",
    "missingSkills",
    "firstSeenAt",
    "lastSeenAt",
  ];
  const rows = [columns.join(",")];
  for (const job of jobs) {
    rows.push(columns.map((column) => csvEscape(job[column])).join(","));
  }
  fs.writeFileSync(APPLICATIONS_CSV, `${rows.join("\n")}\n`, "utf8");
}

function draftText(job) {
  const reasons = job.matchReasons.slice(0, 5).join(", ") || "the role aligns with my AI/ML background";
  const missing = job.missingSkills.length ? job.missingSkills.join(", ") : "none identified";
  return `# ${job.company} - ${job.title}

Source: ${sourceLabel(job.source)}
Score: ${job.score}
Status: ${job.status}
Location: ${job.location}
Link: ${job.url}

## Why This Fits
${reasons}

## Short Cover Note
Hi ${job.company} team,

I am a Computer Science student at FAST National University with hands-on experience in Python, machine learning, NLP, TensorFlow/Keras/PyTorch, Pandas, and anomaly detection. Your ${job.title} role stood out because it aligns with my AI/ML project work, including UEBA anomaly detection, natural language data querying, and deep learning image classification.

I would be excited to contribute, learn from the team, and bring strong implementation discipline to the internship.

Best,
Taha Ahmed

## LinkedIn / Referral Message
Hi, I saw the ${job.title} opportunity at ${job.company}. I am a CS student focused on AI/ML, Python, NLP, and anomaly detection, and I would appreciate any guidance or referral consideration for this role.

## Resume Tailoring Notes
- Emphasize Python, Machine Learning / AI, NLP, Transformers, TensorFlow, Keras, PyTorch, Pandas, and anomaly detection.
- Mention the UEBA Anomaly Detection System first if the role references security, logs, anomaly detection, or behavior analytics.
- Missing or optional skills to review before applying: ${missing}.
`;
}

function writeDrafts(jobs) {
  const drafted = [];
  for (const job of jobs.filter((item) => item.score >= DRAFT_THRESHOLD)) {
    const fileName = `${slug(`${job.company}-${job.title}`)}.md`;
    const filePath = path.join(DRAFTS_DIR, fileName);
    fs.writeFileSync(filePath, draftText(job), "utf8");
    if (job.status === "shortlisted") job.status = "drafted";
    drafted.push(filePath);
  }
  return drafted;
}

function writeBrief(jobs) {
  const date = today();
  const top = jobs
    .filter((job) => job.score >= 60 && !["ignored", "rejected"].includes(job.status))
    .slice(0, 12);
  const lines = [
    `# AI/ML Internship Brief - ${date}`,
    "",
    `Generated: ${nowIso()}`,
    "",
    `Top matches: ${top.length}`,
    "",
  ];

  if (!top.length) {
    lines.push("No strong matches found yet. Re-run search later or broaden sources/locations.");
  }

  for (const [index, job] of top.entries()) {
    lines.push(`## ${index + 1}. ${job.title} - ${job.company}`);
    lines.push("");
    lines.push(`Score: ${job.score} | Status: ${job.status} | Source: ${sourceLabel(job.source)}`);
    lines.push(`Location: ${job.location} | Remote: ${job.remoteType}`);
    lines.push(`Link: ${job.url}`);
    lines.push("");
    lines.push(`Why it fits: ${job.matchReasons.slice(0, 5).join("; ") || "needs manual review"}`);
    if (job.missingSkills.length) lines.push(`Skills to review: ${job.missingSkills.join(", ")}`);
    lines.push("");
  }

  const briefPath = path.join(TRACKERS_DIR, `daily_brief_${date}.md`);
  const latestPath = path.join(TRACKERS_DIR, "daily_brief_latest.md");
  fs.writeFileSync(briefPath, `${lines.join("\n")}\n`, "utf8");
  fs.writeFileSync(latestPath, `${lines.join("\n")}\n`, "utf8");
  return briefPath;
}

async function extractCandidates(page, source) {
  const pattern = SOURCES[source].jobUrlPattern;
  const links = await page.$$eval("a[href]", (anchors) =>
    anchors.map((anchor) => ({
      href: anchor.href,
      text: anchor.innerText,
      aria: anchor.getAttribute("aria-label") || "",
    }))
  );
  const seen = new Set();
  const candidates = [];
  for (const link of links) {
    const url = normalizeUrl(link.href);
    const text = normalizeSpace(link.text || link.aria);
    if (!url || seen.has(url) || !pattern.test(url)) continue;
    if (!/\b(ai|machine|ml|data|nlp|llm|python|intern|trainee)\b/i.test(`${text} ${url}`)) continue;
    seen.add(url);
    candidates.push({ url, title: text || "Internship role" });
  }
  return candidates.slice(0, 12);
}

async function scrapeSearch(args) {
  ensureDirs();
  const browser = await chromium.launch({ headless: !args.headful });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  });
  const fetchedAt = nowIso();
  const jobs = [];

  try {
    for (const source of args.sources) {
      if (!SOURCES[source]) {
        console.warn(`Skipping unknown source: ${source}`);
        continue;
      }
      for (const query of DEFAULT_QUERIES) {
        for (const location of DEFAULT_LOCATIONS) {
          if (jobs.length >= args.limit * args.sources.length) break;
          const url = SOURCES[source].buildSearchUrl(query, location);
          console.log(`Searching ${sourceLabel(source)}: ${query} / ${location}`);
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.waitForTimeout(1500);
            const title = await page.title();
            const text = repairText(await page.locator("body").innerText({ timeout: 8000 }).catch(() => ""));
            const rawPath = path.join(JOBS_DIR, `${today()}_${source}_${slug(query)}_${slug(location)}.json`);
            writeJson(rawPath, { source, query, location, url, title, fetchedAt, text: normalizeSpace(text).slice(0, 25000) });

            const candidates = await extractCandidates(page, source);
            for (const candidate of candidates.slice(0, args.limit)) {
              try {
                await page.goto(candidate.url, { waitUntil: "domcontentloaded", timeout: 30000 });
                await page.waitForTimeout(1200);
                const rawDetailText = repairText(await page.locator("body").innerText({ timeout: 8000 }).catch(() => ""));
                const detailText = normalizeSpace(rawDetailText);
                const detailTitle = normalizeSpace(await page.title());
                const titleText = normalizeSpace(candidate.title || detailTitle).split("\n")[0].slice(0, 140);
                const inferredLocation = inferLocation(rawDetailText, location);
                jobs.push({
                  source,
                  company: extractCompanyFromText(rawDetailText),
                  title: titleText || detailTitle || "Internship role",
                  location: inferredLocation,
                  remoteType: inferRemoteType(inferredLocation, detailText),
                  url: candidate.url,
                  postedDate: "",
                  description: detailText.slice(0, 6000),
                  requirements: detailText.slice(0, 6000),
                });
              } catch (error) {
                console.warn(`Could not read detail page: ${candidate.url} (${error.message})`);
              }
            }
          } catch (error) {
            console.warn(`Search failed for ${sourceLabel(source)} ${query}/${location}: ${error.message}`);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  return jobs;
}

function loadResumeText() {
  return fs.existsSync(RESUME_PATH) ? fs.readFileSync(RESUME_PATH, "utf8") : "";
}

function saveJobs(jobs) {
  ensureDirs();
  writeJson(JOBS_JSON, jobs);
  writeTracker(jobs);
}

async function commandSearch(args) {
  const resumeText = loadResumeText();
  const existingJobs = readJson(JOBS_JSON, []);
  const scrapedJobs = await scrapeSearch(args);
  const mergedJobs = mergeJobs(existingJobs, scrapedJobs, resumeText);
  saveJobs(mergedJobs);
  console.log(`Saved ${mergedJobs.length} jobs (${scrapedJobs.length} newly scraped).`);
}

function commandScore() {
  ensureDirs();
  const resumeText = loadResumeText();
  const jobs = readJson(JOBS_JSON, []);
  const scored = mergeJobs([], jobs, resumeText);
  saveJobs(scored);
  console.log(`Scored ${scored.length} jobs.`);
}

function commandBrief() {
  ensureDirs();
  const jobs = readJson(JOBS_JSON, []);
  const drafted = writeDrafts(jobs);
  saveJobs(jobs);
  const briefPath = writeBrief(jobs);
  console.log(`Brief written to ${briefPath}`);
  console.log(`Drafts written: ${drafted.length}`);
}

async function commandRun(args) {
  await commandSearch(args);
  commandScore();
  commandBrief();
}

function commandTest() {
  const resumeText = loadResumeText();
  const samples = [
    {
      source: "fixture",
      company: "Good AI Lab",
      title: "Machine Learning Intern",
      location: "Remote Pakistan",
      remoteType: "remote",
      url: "https://example.com/ml-intern",
      description: "Python NLP LLM Transformers PyTorch Pandas anomaly detection internship.",
    },
    {
      source: "fixture",
      company: "Frontend Corp",
      title: "Senior Frontend Lead",
      location: "US only",
      remoteType: "remote",
      url: "https://example.com/frontend-lead",
      description: "Senior React marketing website role. 5+ years. United States only.",
    },
    {
      source: "fixture",
      company: "Good AI Lab",
      title: "Machine Learning Intern",
      location: "Remote Pakistan",
      remoteType: "remote",
      url: "https://example.com/ml-intern",
      description: "Duplicate role should merge.",
    },
  ];
  const merged = mergeJobs([], samples, resumeText);
  const good = merged.find((job) => job.company === "Good AI Lab");
  const bad = merged.find((job) => job.company === "Frontend Corp");
  const failures = [];
  if (merged.length !== 2) failures.push("duplicate detection failed");
  if (!good || good.score < DRAFT_THRESHOLD) failures.push("AI/ML internship did not score high enough");
  if (!bad || bad.score >= 60) failures.push("senior/non-target role scored too high");
  if (good?.status !== "shortlisted") failures.push("high-score role was not shortlisted");

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Job hunter self-test passed.");
  console.log(`Good role score: ${good.score}`);
  console.log(`Bad role score: ${bad.score}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDirs();
  if (args.command === "search") return commandSearch(args);
  if (args.command === "score") return commandScore(args);
  if (args.command === "brief") return commandBrief(args);
  if (args.command === "run") return commandRun(args);
  if (args.command === "test") return commandTest();
  console.error(`Unknown command: ${args.command}`);
  console.error("Use one of: run, search, score, brief, test");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
