import { supabase } from "@/src/lib/supabaseClient";

const MAX_FILE_SIZE =
  50 * 1024 * 1024;

export async function uploadInterviewVideo(
  videoBlob: Blob,
  candidateName: string,
  jobTitle: string
) {
  try {
    /*
     * =====================================================
     * FILE SIZE CHECK
     * =====================================================
     */

    const fileSizeMB =
      videoBlob.size /
      (1024 * 1024);

    console.log(
      `📦 Interview video size: ${fileSizeMB.toFixed(
        2
      )} MB`
    );

    /*
     * Keep a little safety margin.
     *
     * Supabase limit = 50 MB
     * We allow only up to 48 MB.
     */

    const SAFE_MAX_FILE_SIZE =
      48 * 1024 * 1024;

    if (
      videoBlob.size >
      SAFE_MAX_FILE_SIZE
    ) {
      const message =
        `Interview recording is too large (${fileSizeMB.toFixed(
          2
        )} MB). Maximum safe upload size is 48 MB.`;

      console.error(
        "❌",
        message
      );

      return {
        success: false,
        error: new Error(message),
      };
    }

    /*
     * =====================================================
     * FILE NAME
     * =====================================================
     */

    const safeCandidateName =
      candidateName
        .trim()
        .replace(
          /[^a-zA-Z0-9-_]+/g,
          "-"
        )
        .replace(
          /-+/g,
          "-"
        )
        .toLowerCase();

    const fileName =
      `${Date.now()}-${safeCandidateName || "candidate"}.webm`;

    const filePath =
      `interviews/${fileName}`;

    console.log(
      "📤 Uploading:",
      filePath
    );

    /*
     * =====================================================
     * SUPABASE UPLOAD
     * =====================================================
     */

    const {
      error: uploadError,
    } = await supabase.storage
      .from("interview-videos")
      .upload(
        filePath,
        videoBlob,
        {
          contentType:
            "video/webm",

          cacheControl:
            "3600",

          upsert: false,
        }
      );

    if (uploadError) {
      console.error(
        "❌ Supabase video upload error:",
        uploadError
      );

      return {
        success: false,
        error: uploadError,
      };
    }

    /*
     * =====================================================
     * PUBLIC URL
     * =====================================================
     */

    const {
      data: publicUrlData,
    } =
      supabase.storage
        .from(
          "interview-videos"
        )
        .getPublicUrl(
          filePath
        );

    const videoUrl =
      publicUrlData.publicUrl;

    console.log(
      "✅ Interview video uploaded successfully."
    );

    console.log(
      "🎥 Video URL:",
      videoUrl
    );

    return {
      success: true,
      videoUrl,
      filePath,
      candidateName,
      jobTitle,
    };
  } catch (error) {
    console.error(
      "❌ Failed to upload interview video:",
      error
    );

    return {
      success: false,
      error,
    };
  }
}