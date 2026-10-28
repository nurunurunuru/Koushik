# AI Recruiter — Voice Screening Platform

A full recruitment platform with two portals:

- **Admin dashboard** — post jobs (with AI auto-fill), review AI-scored applications,
  approve candidates for interview, read AI-generated interview reports, and make the
  final hire/reject call.
- **Candidate portal** — browse open jobs, apply with a resume, see an instant AI match
  score, and (once approved) take a real AI voice interview right in the browser.

## How the workflow works

1. **Admin posts a job.** Type just a job title and click **AI Auto-fill** — Gemini
   writes the full description, requirements, responsibilities, skills, and a
   suggested salary range. Everything is editable before publishing, or you can skip
   AI and write it all yourself.
1b. **Admin sets the interview question set** for that job — click **AI Auto-fill
   Questions** to have Gemini draft 6 role-specific questions from the job details, add
   your own manually, or edit/remove any of them before publishing.
2. **Candidate registers and applies.** They browse `/portal/jobs`, pick a role, and
   paste their resume text. Gemini immediately compares it against the job and stores
   a **match score (0–100%)** plus a summary of strengths/gaps.
2b. **Auto-screening.** Right after the AI scores a resume, candidates scoring **50% or more** are automatically approved and emailed an interview invite; candidates below 50% are automatically rejected (and emailed). Change the cut-off with `AUTO_SCREEN_THRESHOLD` in `.env`. If the AI fails to score a resume, the candidate is left for manual review.
3. **Admin reviews AI-scored applicants** on `/candidates`. Each card shows the match
   %, the AI's analysis, and two buttons: **Approve & Send Interview Invite** or
   **Reject**.
4. **Approving sends a real email** (via Gmail SMTP) with a link to the candidate's
   personal interview room.
5. **Candidate takes the interview** at `/portal/interview/[id]` — the existing
   Vapi-powered `RecruiterVoiceAgent` widget asks exactly the questions set for that
   job (see "Setting up the Vapi assistant" below). When the call ends, the transcript
   is sent to the server.
6. **Gemini writes a structured interview report** (overall score, communication vs.
   technical scores, strengths, concerns, per-skill ratings, recommendation) that
   appears on the candidate's card and in Call History.
7. **Admin makes the final call** — Move to Office Interview (hired) or Reject — and
   the candidate is emailed automatically either way.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values below
npx prisma generate
npx prisma db push     # sync schema to MongoDB
npm run db:seed        # creates an admin + demo candidate + sample jobs
npm run dev
```

### Required environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MongoDB connection string |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | NextAuth session signing |
| `NEXT_PUBLIC_VAPI_API_KEY`, `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | Voice interview widget ([dashboard.vapi.ai](https://dashboard.vapi.ai)) |
| `GEMINI_API_KEY` | Resume matching, AI job auto-fill, interview reports ([aistudio.google.com/apikey](https://aistudio.google.com/apikey), free tier works) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sends interview invite / rejection / hired emails via Gmail SMTP. Requires 2-Step Verification + an [App Password](https://myaccount.google.com/apppasswords) |
| `ADMIN_SIGNUP_CODE` | Secret code required to register an Admin account at `/register`. If unset, admin signup is disabled (candidates can still register). |
| `NEXT_PUBLIC_APP_URL` | Used to build the interview link in invitation emails |

If `GEMINI_API_KEY` or the Gmail vars aren't set yet, the app still works — applications
are just saved without a match score / without sending the email, and errors are logged
server-side instead of crashing the request.

### Setting up the Vapi assistant to ask job-specific questions

Each job now has its own interview question set (added manually by the admin, or
generated with the **AI Auto-fill Questions** button on the job form). For the AI voice
interviewer to actually ask *those* questions instead of generic ones, your Vapi
assistant's system prompt must reference them using Vapi's variable syntax:

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai) → your assistant → **Model** tab
2. Set the system prompt to something like:
   ```
   You are a friendly AI recruiter conducting a voice screening interview with
   {{candidateName}} for the {{jobTitle}} position.

   Ask the candidate the following questions, one at a time. Let them fully answer
   before moving to the next question, and ask a brief natural follow-up if their
   answer is very short:

   {{questions}}

   After all questions are answered, thank the candidate warmly and end the call.
   ```
3. Save the assistant.

The app sends `candidateName`, `jobTitle`, and a numbered `questions` list as Vapi
`assistantOverrides.variableValues` on every call, so the same assistant automatically
asks different questions for every job and candidate — no need to create a separate
Vapi assistant per job.

### Demo accounts (from `npm run db:seed`)

- Admin: `admin@recruiter.com` / `admin123`
- Candidate: `candidate@example.com` / `candidate123`

Both candidates **and admins (recruiters)** can self-register at `/register` — pick the account type at the top of the form. Each admin only sees the jobs they posted and the candidates who applied to those jobs.

After pulling this update run `npx prisma db push && npm run db:seed` once: it adds the job-owner field and assigns any existing jobs to `admin@recruiter.com`.

## Routes

| Path | Who | Purpose |
|---|---|---|
| `/login`, `/register` | Everyone | Auth |
| `/dashboard`, `/jobs`, `/candidates`, `/calls` | Admin only | Manage jobs, review AI scores, approve/reject, view interview reports |
| `/portal/jobs` | Candidate only | Browse & apply to open roles |
| `/portal/applications` | Candidate only | Track application status |
| `/portal/interview/[id]` | Candidate only | Take the AI voice interview once approved |

Route access is enforced both in `middleware.ts` (redirects) and in each layout/tRPC
procedure (`adminProcedure` / `candidateProcedure`), so the two roles can never see
each other's pages or call each other's API routes.
