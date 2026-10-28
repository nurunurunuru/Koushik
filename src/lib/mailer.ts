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

export async function sendInterviewInvitationEmail(params: {
  to: string;
  candidateName: string;
  jobTitle: string;
  interviewUrl: string;
  matchScore: number;
}) {
  const html = `
  <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.6;">
    <h2 style="color:#4f46e5;">You're invited to interview for ${params.jobTitle}!</h2>
    <p>Hi ${params.candidateName},</p>
    <p>Great news! After reviewing your application, we'd like to invite you to the next step: a short
    AI-powered voice screening interview for the <strong>${params.jobTitle}</strong> position.</p>
    <p>Your resume matched <strong>${params.matchScore}%</strong> of the role's requirements.</p>
    <p>Click the button below whenever you're ready (find a quiet place with a working microphone,
    it takes about 10-15 minutes):</p>
    <p style="text-align:center; margin: 28px 0;">
      <a href="${params.interviewUrl}" style="background:#4f46e5;color:#fff;padding:12px 24px;
      border-radius:8px;text-decoration:none;font-weight:600;">Start My Interview</a>
    </p>
    <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy this link into your browser:<br/>
    ${params.interviewUrl}</p>
    <p>Good luck!<br/>The Hiring Team</p>
  </div>`;
  await sendMail(params.to, `Interview Invitation: ${params.jobTitle}`, html);
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
