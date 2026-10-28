"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Modal } from "@/src/components/ui/modal";
import { timeAgo } from "@/src/lib/utils";
import Link from "next/link";

const EMPTY_JOB = {
  title: "",
  description: "",
  requirements: "",
  responsibilities: "",
  skills: "",
  employmentType: "FULL_TIME",
  experienceLevel: "MID",
  salaryRange: "",
  department: "",
  location: "",
  status: "ACTIVE" as "ACTIVE" | "CLOSED" | "DRAFT",
  aiGenerated: false,
};

function parseQuestions(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function JobsClient() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: jobs, isLoading } = useQuery(trpc.jobs.getAll.queryOptions());
  const [showCreate, setShowCreate] = useState(false);
  const [aiError, setAiError] = useState("");
  const [questionsError, setQuestionsError] = useState("");
  const [newJob, setNewJob] = useState(EMPTY_JOB);
  const [questions, setQuestions] = useState<string[]>([]);

  const createJob = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.jobs.getAll.queryKey() });
        setShowCreate(false);
        setNewJob(EMPTY_JOB);
        setQuestions([]);
      },
    })
  );

  const deleteJob = useMutation(
    trpc.jobs.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.jobs.getAll.queryKey() });
      },
    })
  );

  const generateWithAI = useMutation(
    trpc.jobs.generateWithAI.mutationOptions({
      onSuccess: (data) => {
        setAiError("");
        setNewJob((prev) => ({
          ...prev,
          description: data.description,
          requirements: data.requirements,
          responsibilities: data.responsibilities,
          skills: data.skills,
          employmentType: data.employmentType || prev.employmentType,
          experienceLevel: data.experienceLevel || prev.experienceLevel,
          salaryRange: data.salaryRange,
          aiGenerated: true,
        }));
      },
      onError: (err) => setAiError(err.message || "AI generation failed."),
    })
  );

  const generateQuestions = useMutation(
    trpc.jobs.generateQuestionsWithAI.mutationOptions({
      onSuccess: (data) => {
        setQuestionsError("");
        setQuestions(data.questions);
      },
      onError: (err) => setQuestionsError(err.message || "AI question generation failed."),
    })
  );

  const handleGenerate = () => {
    if (!newJob.title.trim()) {
      setAiError("Enter a job title first.");
      return;
    }
    setAiError("");
    generateWithAI.mutate({
      title: newJob.title,
      department: newJob.department || undefined,
      location: newJob.location || undefined,
    });
  };

  const handleGenerateQuestions = () => {
    if (!newJob.title.trim() || !newJob.description.trim()) {
      setQuestionsError("Fill in the job title and description first (use AI Auto-fill above, or write your own).");
      return;
    }
    setQuestionsError("");
    generateQuestions.mutate({
      title: newJob.title,
      description: newJob.description,
      requirements: newJob.requirements || undefined,
      skills: newJob.skills || undefined,
    });
  };

  const updateQuestion = (index: number, value: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, ""]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your job postings and open positions
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Job
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">Loading jobs...</div>
          ) : jobs && jobs.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {jobs.map((job) => {
                const qCount = parseQuestions(job.interviewQuestions).length;
                return (
                  <div key={job.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/candidates?jobId=${job.id}`} className="text-sm font-medium text-gray-900 hover:text-primary-600 transition-colors">
                          {job.title}
                        </Link>
                        <Badge status={job.status} />
                        {job.aiGenerated && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent-50 text-accent-700">
                            AI Generated
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {job.department ?? "General"}
                        {job.location && ` · ${job.location}`}
                        <span className="mx-1">·</span>
                        {job._count.candidates} candidate{job._count.candidates !== 1 ? "s" : ""}
                        <span className="mx-1">·</span>
                        {qCount > 0 ? `${qCount} interview question${qCount !== 1 ? "s" : ""}` : "No interview questions set"}
                        <span className="mx-1">·</span>
                        Created {timeAgo(job.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <Button variant="secondary" size="sm" onClick={() => {
                        const params = new URLSearchParams({ jobId: job.id });
                        window.location.href = `/candidates?${params}`;
                      }}>
                        View Candidates
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (window.confirm(`Delete "${job.title}"? This will also remove all associated candidates.`)) {
                          deleteJob.mutate({ id: job.id });
                        }
                      }}>
                        <svg className="w-4 h-4 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium text-gray-500">No jobs yet</p>
              <p className="text-xs text-gray-400 mt-1">Create your first job posting to start recruiting</p>
              <Button className="mt-4" size="sm" onClick={() => setShowCreate(true)}>Create Job</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setNewJob(EMPTY_JOB);
          setQuestions([]);
          setAiError("");
          setQuestionsError("");
        }}
        title="Create New Job"
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createJob.mutate({ ...newJob, interviewQuestions: questions.filter((q) => q.trim()) });
          }}
          className="p-6 space-y-4"
        >
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Job Title"
                id="title"
                placeholder="e.g. Senior Software Engineer"
                value={newJob.title}
                onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                required
              />
            </div>
            <Button
              type="button"
              variant="accent"
              onClick={handleGenerate}
              isLoading={generateWithAI.isPending}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              AI Auto-fill
            </Button>
          </div>
          {aiError && <p className="text-xs text-red-600">{aiError}</p>}
          {newJob.aiGenerated && (
            <p className="text-xs text-accent-700 bg-accent-50 rounded-lg px-3 py-2">
              ✨ Generated by AI — feel free to edit anything below before publishing.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Department" id="department" placeholder="e.g. Engineering" value={newJob.department} onChange={(e) => setNewJob({ ...newJob, department: e.target.value })} />
            <Input label="Location" id="location" placeholder="e.g. Remote" value={newJob.location} onChange={(e) => setNewJob({ ...newJob, location: e.target.value })} />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
            <textarea id="description" rows={4} placeholder="Describe the role and responsibilities..." className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" value={newJob.description} onChange={(e) => setNewJob({ ...newJob, description: e.target.value })} required />
          </div>

          <div className="space-y-1">
            <label htmlFor="requirements" className="block text-sm font-medium text-gray-700">Requirements</label>
            <textarea id="requirements" rows={3} placeholder="- 5+ years of experience...&#10;- Strong knowledge of..." className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" value={newJob.requirements} onChange={(e) => setNewJob({ ...newJob, requirements: e.target.value })} />
          </div>

          <div className="space-y-1">
            <label htmlFor="responsibilities" className="block text-sm font-medium text-gray-700">Responsibilities</label>
            <textarea id="responsibilities" rows={3} placeholder="- Design and build...&#10;- Collaborate with..." className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" value={newJob.responsibilities} onChange={(e) => setNewJob({ ...newJob, responsibilities: e.target.value })} />
          </div>

          <Input label="Key Skills (comma separated)" id="skills" placeholder="React, TypeScript, Node.js..." value={newJob.skills} onChange={(e) => setNewJob({ ...newJob, skills: e.target.value })} />

          <div className="grid grid-cols-3 gap-4">
            <Select label="Employment Type" id="employmentType" value={newJob.employmentType} onChange={(e) => setNewJob({ ...newJob, employmentType: e.target.value })}
              options={[{ value: "FULL_TIME", label: "Full-time" }, { value: "PART_TIME", label: "Part-time" }, { value: "CONTRACT", label: "Contract" }, { value: "INTERNSHIP", label: "Internship" }]} />
            <Select label="Experience Level" id="experienceLevel" value={newJob.experienceLevel} onChange={(e) => setNewJob({ ...newJob, experienceLevel: e.target.value })}
              options={[{ value: "ENTRY", label: "Entry" }, { value: "MID", label: "Mid" }, { value: "SENIOR", label: "Senior" }, { value: "LEAD", label: "Lead" }]} />
            <Input label="Salary Range" id="salaryRange" placeholder="$70k - $95k" value={newJob.salaryRange} onChange={(e) => setNewJob({ ...newJob, salaryRange: e.target.value })} />
          </div>

          <Select label="Status" id="status" value={newJob.status} onChange={(e) => setNewJob({ ...newJob, status: e.target.value as "ACTIVE" | "CLOSED" | "DRAFT" })}
            options={[{ value: "ACTIVE", label: "Active" }, { value: "DRAFT", label: "Draft" }, { value: "CLOSED", label: "Closed" }]} />

          {/* Interview Questions */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700">Interview Questions</label>
                <p className="text-xs text-gray-400">
                  The AI voice interviewer will ask candidates exactly these questions.
                </p>
              </div>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={handleGenerateQuestions}
                isLoading={generateQuestions.isPending}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                AI Auto-fill Questions
              </Button>
            </div>
            {questionsError && <p className="text-xs text-red-600">{questionsError}</p>}

            {questions.length > 0 ? (
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 mt-2.5 w-5 flex-shrink-0">{i + 1}.</span>
                    <textarea
                      rows={2}
                      value={q}
                      onChange={(e) => updateQuestion(i, e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeQuestion(i)}
                      className="mt-2 text-gray-400 hover:text-red-500 flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                No questions added yet. Use AI Auto-fill above, or add your own manually below.
              </p>
            )}

            <Button type="button" variant="secondary" size="sm" onClick={addQuestion}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Question
            </Button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); setNewJob(EMPTY_JOB); setQuestions([]); }}>Cancel</Button>
            <Button type="submit" isLoading={createJob.isPending}>Publish Job</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
