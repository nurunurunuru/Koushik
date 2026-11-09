import nodemailer from "nodemailer";

// Uses a Gmail account via SMTP. To set this up:
// 1. Enable 2-Step Verification on the Gmail account
// 2. Create an "App Password": https://myaccount.google.com/apppasswords
// 3. Set GMAIL_USER=you@gmail.com and GMAIL_APP_PASSWORD=<16 char app password> in .env

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set. Add them to your .env file to enable emails."
    );
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

async function sendMail(to: string, subject: string, html: string) {
  const transporter = getTransporter();
  const from = process.env.GMAIL_USER;
  await transporter.sendMail({ from: `AI Recruiter <${from}>`, to, subject, html });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Interview date/time as shown in emails. Set APP_TIMEZONE in .env to change it (default: Asia/Dhaka).
function formatInterviewDate(date: Date) {
  const timeZone = process.env.APP_TIMEZONE || "Asia/Dhaka";
  const text = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(date);
  return `${text} (${timeZone})`;
}

export async function sendInterviewScheduleEmail(params: {
  to: string;
  candidateName: string;
  jobTitle: string;
  interviewAt: Date;
  order: number;
  venue?: string | null;
  portalUrl: string; // link to the candidate's account page with the interview details
  meetingLink?: string | null; // optional extra link added by the company
}) {
  const jobTitle = escapeHtml(params.jobTitle);
  const candidateName = escapeHtml(params.candidateName);
  const venue = params.venue?.trim() ? escapeHtml(params.venue.trim()) : null;
  const meetingLink = params.meetingLink?.trim() ? escapeHtml(params.meetingLink.trim()) : null;

  const html = `
  <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.6;">
    <h2 style="color:#4f46e5;">You're selected for the interview: ${jobTitle}</h2>
    <p>Hi ${candidateName},</p>
    <p>Congratulations! After reviewing the applications, the company has selected you for the interview
    for the <strong>${jobTitle}</strong> position.</p>
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <strong>Interview date &amp; time:</strong><br/>${escapeHtml(formatInterviewDate(params.interviewAt))}<br/>
      ${venue ? `<strong>Venue:</strong> ${venue}<br/>` : ""}
      <strong>Your interview number:</strong> ${params.order}
    </div>
    <p>The interview is held <strong>in person in front of the company's board members</strong>.
    Please arrive a little early. Candidates are called one by one by name, and an AI interviewer will
    ask you questions live along with the board.</p>
    <p style="margin:24px 0 8px;">
      <a href="${params.portalUrl}"
         style="background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
        View my interview details
      </a>
    </p>
    ${
      meetingLink
        ? `<p style="margin:8px 0;">
      <a href="${meetingLink}"
         style="background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
        Open interview link
      </a>
    </p>`
        : ""
    }
    <p style="font-size:12px;color:#6b7280;">If the buttons do not work, copy this link into your browser:<br/>
    ${escapeHtml(params.portalUrl)}${meetingLink ? `<br/>${meetingLink}` : ""}</p>
    <p>Good luck!</p>
  </div>`;
  await sendMail(params.to, `Interview Schedule: ${params.jobTitle}`, html);
}

export async function sendRejectionEmail(params: {
  to: string;
  candidateName: string;
  jobTitle: string;
}) {
  const html = `
  <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.6;">
    <p>Hi ${params.candidateName},</p>
    <p>Thank you for applying for the <strong>${params.jobTitle}</strong> position. After careful
    review, we've decided to move forward with other candidates whose experience more closely
    matches our current needs.</p>
    <p>We appreciate the time you invested and encourage you to apply for future openings that fit
    your background.</p>
    <p>Best of luck in your search!<br/>The Hiring Team</p>
  </div>`;
  await sendMail(params.to, `Update on your application: ${params.jobTitle}`, html);
}

export async function sendHiredEmail(params: {
  to: string;
  candidateName: string;
  jobTitle: string;
}) {
  const html = `
  <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.6;">
    <h2 style="color:#16a34a;">Congratulations, ${params.candidateName}!</h2>
    <p>We were impressed by your interview for the <strong>${params.jobTitle}</strong> position and
    would like to move forward with an in-person/office interview.</p>
    <p>Our team will reach out shortly to schedule a time. We look forward to speaking with you!</p>
    <p>Best,<br/>The Hiring Team</p>
  </div>`;
  await sendMail(params.to, `You're moving forward: ${params.jobTitle}`, html);
}
