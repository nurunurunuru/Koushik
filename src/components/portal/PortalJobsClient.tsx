"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardFooter } from "@/src/components/ui/card";
import { Modal } from "@/src/components/ui/modal";
import { timeAgo, formatDateTime } from "@/src/lib/utils";

// "- item" / "• item" multi-line text -> clean list items
function toLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

const EXPERIENCE_LABELS: Record<string, string> = {
  ENTRY: "Entry level",
  MID: "Mid level",
  SENIOR: "Senior",
  LEAD: "Lead",
};

function DetailSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-1.5">{title}</h4>
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function PortalJobsClient() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: jobs, isLoading } = useQuery(trpc.jobs.getAllPublic.queryOptions());
  const { data: myApplications } = useQuery(trpc.candidates.getMyApplications.queryOptions());

  const [applyJob, setApplyJob] = useState<{ id: string; title: string } | null>(null);
  const [detailJob, setDetailJob] = useState<NonNullable<typeof jobs>[number] | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    matchScore?: number | null;
    decision?: "SHORTLISTED" | "REJECTED" | null;
  } | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const appliedJobIds = new Set((myApplications ?? []).map((a) => a.job.id));

  const apply = useMutation(
    trpc.candidates.submitApplication.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: trpc.candidates.getMyApplications.queryKey() });
        setSuccess({
          matchScore: data.matchScore,
          decision: data.decision,
        });
        setResumeText("");
        setPhone("");
        setUploadedFileName("");
        setResumeUrl("");
      },
      onError: (err) => setError(err.message || "Failed to apply."),
    })
  );

 const closeModal = () => {
  setApplyJob(null);
  setError("");
  setSuccess(null);
  setUploadedFileName("");
  setResumeUrl("");
  setIsParsingPdf(false);

  if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
};

  const handlePdfUpload = async (
  e: React.ChangeEvent<HTMLInputElement>
) => {
  const file = e.target.files?.[0];

  if (!file) return;

  setError("");
  setIsParsingPdf(true);
  setUploadedFileName(file.name);
  setResumeUrl("");

  try {
    /*
     * STEP 1
     * Extract text from PDF for AI analysis
     */
    const parseFormData = new FormData();
    parseFormData.append("file", file);

    const parseRes = await fetch("/api/parse-resume", {
      method: "POST",
      body: parseFormData,
    });

    const parseData = await parseRes.json();

    if (!parseRes.ok) {
      throw new Error(
        parseData.error || "Failed to read PDF."
      );
    }

    setResumeText(parseData.text);

    /*
     * STEP 2
     * Save the actual PDF file
     */
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);

    const uploadRes = await fetch("/api/upload-resume", {
      method: "POST",
      body: uploadFormData,
    });

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      throw new Error(
        uploadData.error || "Failed to save PDF."
      );
    }

    /*
     * Save URL so it can be stored with the application
     */
    setResumeUrl(uploadData.resumeUrl);

  } catch (err: any) {
    console.error("Resume upload error:", err);

    setError(
      err.message ||
        "Failed to upload resume. Please try again."
    );

    setUploadedFileName("");
    setResumeUrl("");
  } finally {
    setIsParsingPdf(false);
  }
};

  const handleApply = () => {
  if (!applyJob) return;

  setError("");

  if (!resumeUrl) {
    setError(
      "Please upload your resume PDF before submitting your application."
    );
    return;
  }

  apply.mutate({
    jobId: applyJob.id,
    resumeText,
    resumeUrl,
    phone: phone || undefined,
  });
};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Open Positions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse open roles and apply — our AI will review your resume right away.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading jobs...</div>
      ) : jobs && jobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => {
            const applied = appliedJobIds.has(job.id);
            return (
              <Card key={job.id} hover className="overflow-hidden">
                {job.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={job.imageUrl}
                    alt={job.title}
                    className="h-40 w-full object-cover"
                  />
                )}
                <CardContent className="space-y-2">
                  <h3 className="font-semibold text-gray-900">{job.title}</h3>
                  <p className="text-xs text-gray-500">
                    {job.department ?? "General"}
                    {job.location && ` · ${job.location}`}
                    {job.employmentType && ` · ${job.employmentType.replace("_", " ")}`}
                  </p>
                  <p className="text-sm text-gray-600 line-clamp-3">{job.description}</p>
                  {job.salaryRange && (
                    <p className="text-xs font-medium text-primary-700">{job.salaryRange}</p>
                  )}
                  {job.interviewDate && (
                    <p className="text-xs font-medium text-indigo-700 bg-indigo-50 rounded-md px-2 py-1 inline-block">
                      Planned interview: {formatDateTime(job.interviewDate)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">Posted {timeAgo(job.createdAt)}</p>
                </CardContent>
                <CardFooter>
                  <Button variant="secondary" onClick={() => setDetailJob(job)}>
                    View Details
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={applied}
                    variant={applied ? "secondary" : "primary"}
                    onClick={() => setApplyJob({ id: job.id, title: job.title })}
                  >
                    {applied ? "Already Applied" : "Apply Now"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-sm text-gray-500">
          No open positions right now. Check back soon!
        </div>
      )}

      <Modal
        open={!!detailJob}
        onClose={() => setDetailJob(null)}
        title={detailJob?.title ?? ""}
        size="lg"
      >
        {detailJob && (
          <>
            {detailJob.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detailJob.imageUrl}
                alt={detailJob.title}
                className="h-52 w-full object-cover"
              />
            )}
            <div className="px-6 py-4 space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                {detailJob.department && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{detailJob.department}</span>
                )}
                {detailJob.location && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{detailJob.location}</span>
                )}
                {detailJob.employmentType && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                    {detailJob.employmentType.replace("_", " ")}
                  </span>
                )}
                {detailJob.experienceLevel && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                    {EXPERIENCE_LABELS[detailJob.experienceLevel] ?? detailJob.experienceLevel}
                  </span>
                )}
                {detailJob.salaryRange && (
                  <span className="rounded-full bg-primary-50 px-2.5 py-1 font-medium text-primary-700">
                    {detailJob.salaryRange}
                  </span>
                )}
              </div>

              {detailJob.interviewDate && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                  <strong>Planned interview date:</strong> {formatDateTime(detailJob.interviewDate)}
                  <p className="text-xs text-indigo-700 mt-0.5">
                    If your resume matches 50% or more you are shortlisted. The company selects candidates and emails the exact interview time. The interview is held in person in front of the company's board.
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1.5">About the role</h4>
                <p className="text-sm text-gray-600 whitespace-pre-line">{detailJob.description}</p>
              </div>

              <DetailSection title="Requirements" items={toLines(detailJob.requirements)} />
              <DetailSection title="Responsibilities" items={toLines(detailJob.responsibilities)} />

              {detailJob.skills && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-1.5">Key skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailJob.skills
                      .split(",")
                      .map((skill) => skill.trim())
                      .filter(Boolean)
                      .map((skill) => (
                        <span key={skill} className="rounded-full bg-accent-50 px-2.5 py-1 text-xs text-accent-700">
                          {skill}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400">Posted {timeAgo(detailJob.createdAt)}</p>
            </div>
            <CardFooter>
              <Button variant="secondary" onClick={() => setDetailJob(null)}>
                Close
              </Button>
              <Button
                className="flex-1"
                disabled={appliedJobIds.has(detailJob.id)}
                onClick={() => {
                  setApplyJob({ id: detailJob.id, title: detailJob.title });
                  setDetailJob(null);
                }}
              >
                {appliedJobIds.has(detailJob.id) ? "Already Applied" : "Apply Now"}
              </Button>
            </CardFooter>
          </>
        )}
      </Modal>

      <Modal open={!!applyJob} onClose={closeModal} title={`Apply — ${applyJob?.title ?? ""}`} size="lg">
        <div className="px-6 py-4 space-y-4">
          {success ? (
            <div className="text-center py-6 space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">Application Submitted!</h3>
              <p className="text-sm text-gray-500">
                Our AI has analyzed your resume against this role.
                {typeof success.matchScore === "number" && (
                  <> Your match score: <strong>{success.matchScore}%</strong>.</>
                )}
                {success.decision === "SHORTLISTED"
                  ? " Great match! You are shortlisted. The company will choose the candidates for the interview, and if you are selected you will get the interview date and time by email and in My Applications."
                  : success.decision === "REJECTED"
                  ? " Unfortunately your profile isn't a close enough match for this role. We've emailed you the update."
                  : " You'll receive an email once a recruiter reviews your application."}
              </p>
              <Button onClick={closeModal}>Done</Button>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resume</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                  id="resume-pdf-upload"
                />
                <label
                  htmlFor="resume-pdf-upload"
                  className="flex items-center gap-3 w-full rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50/30 transition-colors px-4 py-3 cursor-pointer"
                >
                  <svg className="w-8 h-8 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div className="min-w-0">
                    {isParsingPdf ? (
                      <p className="text-sm text-primary-600 font-medium">Reading your PDF...</p>
                    ) : uploadedFileName ? (
                      <p className="text-sm text-gray-700 font-medium truncate">
                        ✓ {uploadedFileName} — text extracted below, feel free to edit
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-700 font-medium">Upload your resume PDF</p>
                        <p className="text-xs text-gray-400">or paste the text directly below</p>
                      </>
                    )}
                  </div>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resume text
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  rows={10}
                  placeholder="Paste the full text of your resume here, or upload a PDF above and it will fill in automatically..."
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Our AI will compare this against the job requirements and generate a match score.
                </p>
              </div>
            </>
          )}
        </div>
        {!success && (
          <CardFooter>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button
  onClick={handleApply}
  isLoading={apply.isPending}
  disabled={
    resumeText.trim().length < 30 ||
    !resumeUrl ||
    isParsingPdf
  }
>
  Submit Application
</Button>
          </CardFooter>
        )}
      </Modal>
    </div>
  );
}
