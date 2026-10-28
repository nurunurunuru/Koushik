export interface ResumeAIAnalysis {
  matchScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendation: string;
  details?: {
    semanticScore?: number;
    skillScore?: number;
    matchedSkills?: string[];
    missingSkills?: string[];
    candidateExperience?: number | null;
    requestedExperience?: number | null;
    education?: string[];
  };
}

interface AnalyzeResumeInput {
  resumeText: string;
  jobTitle?: string;
  jobDescription?: string;
  requirements?: string;
  skills?: string;
  responsibilities?: string;
  experienceLevel?: string;
}

const RETRY_DELAYS = [2000, 5000, 10000];

const RETRYABLE_STATUS_CODES = [
  429,
  500,
  502,
  503,
  504,
];

function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function requestGemini(
  model: string,
  apiKey: string,
  prompt: string
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        contents: [
          {
            role: "user",

            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],

        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),

      signal: AbortSignal.timeout(120000),
    }
  );

  return response;
}

async function requestGeminiWithRetry(
  model: string,
  apiKey: string,
  prompt: string
) {
  let lastError: Error | null = null;

  for (
    let attempt = 0;
    attempt <= RETRY_DELAYS.length;
    attempt++
  ) {
    try {
      console.log(
        `🤖 Gemini request: model=${model}, attempt=${attempt + 1}`
      );

      const response = await requestGemini(
        model,
        apiKey,
        prompt
      );

      // Successful response
      if (response.ok) {
        return response;
      }

      const errorText = await response.text();

      console.error(
        `Gemini API Error: ${response.status}`,
        errorText
      );

      // Non-retryable error
      if (
        !RETRYABLE_STATUS_CODES.includes(
          response.status
        )
      ) {
        throw new Error(
          `Gemini API request failed (${response.status})`
        );
      }

      lastError = new Error(
        `Gemini API request failed (${response.status})`
      );

      // শেষ attempt হলে আর retry করবো না
      if (attempt === RETRY_DELAYS.length) {
        break;
      }

      const delay =
        RETRY_DELAYS[attempt];

      console.log(
        `⏳ Gemini temporarily unavailable. Retrying in ${
          delay / 1000
        } seconds...`
      );

      await sleep(delay);
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(String(error));

      console.error(
        `Gemini request attempt ${
          attempt + 1
        } failed:`,
        lastError
      );

      if (attempt === RETRY_DELAYS.length) {
        break;
      }

      const delay =
        RETRY_DELAYS[attempt];

      console.log(
        `⏳ Retrying in ${
          delay / 1000
        } seconds...`
      );

      await sleep(delay);
    }
  }

  throw (
    lastError ||
    new Error("Gemini request failed")
  );
}

export async function analyzeResumeLocally(
  input: AnalyzeResumeInput
): Promise<ResumeAIAnalysis> {
  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured"
    );
  }

  const primaryModel =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  const fallbackModel =
    process.env.GEMINI_FALLBACK_MODEL;

  const prompt = `
You are an advanced AI recruitment and resume analysis system.

Your task is to analyze how well a candidate's resume matches a job.

JOB INFORMATION:

Job Title:
${input.jobTitle || "Not provided"}

Job Description:
${input.jobDescription || "Not provided"}

Requirements:
${input.requirements || "Not provided"}

Required Skills:
${input.skills || "Not provided"}

Responsibilities:
${input.responsibilities || "Not provided"}

Experience Level:
${input.experienceLevel || "Not provided"}

CANDIDATE RESUME:

${input.resumeText}

Analyze the resume carefully against the job requirements.

Return ONLY valid JSON in this exact format:

{
  "matchScore": number,
  "summary": "short professional summary",
  "strengths": ["strength 1", "strength 2"],
  "gaps": ["gap 1", "gap 2"],
  "recommendation": "STRONG_MATCH or GOOD_MATCH or PARTIAL_MATCH or NOT_RECOMMENDED",
  "details": {
    "semanticScore": number,
    "skillScore": number,
    "matchedSkills": ["skill"],
    "missingSkills": ["skill"],
    "candidateExperience": number,
    "requestedExperience": number,
    "education": ["education"]
  }
}

IMPORTANT RULES:

- matchScore must be between 0 and 100.
- Compare actual skills and experience from the resume.
- Do not invent qualifications.
- Be strict but fair.
- If information is unavailable, use null or an empty array.
- Return JSON only.
`;

  try {
    let response: Response;

    try {
      // ==========================================
      // PRIMARY MODEL
      // ==========================================

      response =
        await requestGeminiWithRetry(
          primaryModel,
          apiKey,
          prompt
        );
    } catch (primaryError) {
      console.error(
        `❌ Primary Gemini model failed: ${primaryModel}`,
        primaryError
      );

      // ==========================================
      // FALLBACK MODEL
      // ==========================================

      if (
        fallbackModel &&
        fallbackModel !== primaryModel
      ) {
        console.log(
          `🔄 Trying fallback Gemini model: ${fallbackModel}`
        );

        response =
          await requestGeminiWithRetry(
            fallbackModel,
            apiKey,
            prompt
          );
      } else {
        throw primaryError;
      }
    }

    const data = await response.json();

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error(
        "Invalid Gemini response:",
        JSON.stringify(
          data,
          null,
          2
        )
      );

      throw new Error(
        "Gemini returned an empty response"
      );
    }

    let cleanedText =
      text.trim();

    // Remove ```json
    if (
      cleanedText.startsWith(
        "```json"
      )
    ) {
      cleanedText =
        cleanedText
          .replace(
            /^```json\s*/i,
            ""
          )
          .replace(
            /```$/i,
            ""
          )
          .trim();
    }

    // Remove ```
    if (
      cleanedText.startsWith(
        "```"
      )
    ) {
      cleanedText =
        cleanedText
          .replace(
            /^```\s*/i,
            ""
          )
          .replace(
            /```$/i,
            ""
          )
          .trim();
    }

    const analysis =
      JSON.parse(
        cleanedText
      ) as ResumeAIAnalysis;

    // ==========================================
    // VALIDATE / NORMALIZE RESULT
    // ==========================================

    analysis.matchScore =
      Math.max(
        0,
        Math.min(
          100,
          Number(
            analysis.matchScore
          ) || 0
        )
      );

    analysis.strengths =
      Array.isArray(
        analysis.strengths
      )
        ? analysis.strengths
        : [];

    analysis.gaps =
      Array.isArray(
        analysis.gaps
      )
        ? analysis.gaps
        : [];

    analysis.recommendation =
      analysis.recommendation ||
      "PARTIAL_MATCH";

    if (
      analysis.details
    ) {
      analysis.details.matchedSkills =
        Array.isArray(
          analysis.details
            .matchedSkills
        )
          ? analysis.details
              .matchedSkills
          : [];

      analysis.details.missingSkills =
        Array.isArray(
          analysis.details
            .missingSkills
        )
          ? analysis.details
              .missingSkills
          : [];

      analysis.details.education =
        Array.isArray(
          analysis.details
            .education
        )
          ? analysis.details
              .education
          : [];
    }

    console.log(
      `✅ Resume AI analysis completed using ${primaryModel}`
    );

    return analysis;
  } catch (error) {
    console.error(
      "❌ Resume AI Analysis Error:",
      error
    );

    throw error;
  }
}