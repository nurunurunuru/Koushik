import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "module";
import { getAuthServer } from "@/src/lib/authoption";

export const runtime = "nodejs";

// pdf-parse is a plain CommonJS module. Using Node's `require` directly
// (instead of a dynamic `import()`) avoids all the ESM/CJS interop
// ambiguity that different bundlers (webpack vs Turbopack) handle
// inconsistently for `.default` vs the raw module export.
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buf: Buffer
) => Promise<{ text: string }>;

export async function POST(req: NextRequest) {
  const session = await getAuthServer();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Please upload a PDF file" }, { status: 400 });
    }

    const MAX_SIZE = 8 * 1024 * 1024; // 8MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File is too large (max 8MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdfParse(buffer);

    const text = data.text?.trim();
    if (!text || text.length < 20) {
      return NextResponse.json(
        { error: "Couldn't extract readable text from this PDF. It may be a scanned image — please paste your resume text manually instead." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("Resume PDF parse failed:", err);
    return NextResponse.json(
      { error: "Failed to read this PDF. Please try another file or paste your resume text manually." },
      { status: 500 }
    );
  }
}
