// Pure selection logic for drop-to-contribute: given the files from a drop (or
// picker), choose the one to upload. Mirrors the old /contribute form's
// `accept="image/jpeg,image/png"` and "one photo" contract. Multi-file drops use
// the first file only. This is the unit-tested seam; the DOM drag/drop handlers
// and the upload fetch live in the DropToContribute component (manual seam).

const ACCEPTED = new Set(["image/jpeg", "image/png"]);

export type PickResult = { file: File } | { error: string };

export function pickImage(files: FileList | File[]): PickResult {
  const file = files[0];
  if (!file) {
    return { error: "No file dropped." };
  }
  if (!ACCEPTED.has(file.type)) {
    return { error: "Please drop a JPEG or PNG photo." };
  }
  return { file };
}
