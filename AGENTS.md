# AI Job Hunter Agent (Codex MCP System)

## Purpose
This project is an AI-powered job hunting automation system using MCP tools:
- filesystem (local storage, tracking, resumes)
- playwright (job search + browser automation)
- Gmail (communication - optional)
- Google Drive (resume storage - optional)
- Google Calendar (interview scheduling - optional)

---

## Core Workflow

1. Search AI/ML jobs using Playwright
2. Extract job details (company, role, requirements, link)
3. Score job relevance against resume (0–100)
4. Store results in structured tracker (CSV/JSON)
5. Generate tailored resumes per job
6. Prepare (NOT auto-send) email drafts for outreach
7. Maintain full application history

---

## Job Matching Criteria

High priority:
- Python
- Machine Learning / AI
- NLP / LLMs
- Anomaly Detection / UEBA
- Transformers / Agentic AI

Medium priority:
- Data Science
- Backend (Python-based)
- Research roles

Low priority:
- Non-technical roles
- unrelated domains

---

## Output Structure

- /jobs → raw scraped jobs
- /data → structured + scored jobs
- /resumes → tailored resumes per company
- /trackers → job application