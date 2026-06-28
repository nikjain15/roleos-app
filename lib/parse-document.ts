/**
 * Client-side document → text for onboarding intake. Runs in the BROWSER so the
 * file never leaves the user's machine (the privacy rule: nothing personal
 * persists, or even transits our server, before they sign up). unpdf is
 * lazy-imported only when a PDF is dropped, so it doesn't bloat initial load.
 *
 * Handles the two things people actually have: a LinkedIn "Save to PDF" export
 * (profile → More → Save to PDF) and a CV (PDF or plain text). Image-only
 * scanned PDFs yield little text → the onboarding thin-input guard catches that
 * honestly downstream.
 */

export const ACCEPTED_TYPES = ".pdf,.txt,text/plain,application/pdf";
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a profile PDF is far smaller

export async function extractDocumentText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error("That file's bigger than I can read here — try a smaller PDF or paste the text.");
  }
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || file.type === "text/plain") {
    return (await file.text()).trim();
  }

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  }

  throw new Error("I can read a PDF or a text file. For a Word doc, export it to PDF first.");
}
