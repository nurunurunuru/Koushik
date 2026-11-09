// Shared scoring rules for the live board interview (used by server AND browser).

// Final mark = AI_WEIGHT * AI mark + BOARD_WEIGHT * board mark  (both are 0-100)
// Change these two numbers if the board wants a different split (must add up to 1).
export const AI_WEIGHT = 0.5;
export const BOARD_WEIGHT = 0.5;

// The board gives ONE mark (0 - MAX_BOARD_MARK) after reading the candidate's replies.
export const MAX_BOARD_MARK = 100;

// A question asked by a board member and the candidate's reply.
// Replies are NOT marked automatically: the board reads them later in "Board Review".
export interface BoardEntry {
  question: string;
  answer?: string;
}

// Combines the AI mark and the board mark into one final mark (0-100).
// If only one of them exists, that one is the final mark.
export function computeFinalScore(
  aiScore: number | null | undefined,
  boardScore: number | null | undefined
): number | null {
  const hasAi = typeof aiScore === "number";
  const hasBoard = typeof boardScore === "number";
  if (hasAi && hasBoard) {
    return Math.round(AI_WEIGHT * aiScore + BOARD_WEIGHT * boardScore);
  }
  if (hasAi) return aiScore;
  if (hasBoard) return boardScore;
  return null;
}
