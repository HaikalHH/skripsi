import { parsePositiveAmount } from "../amount";
import { normalizeSpaces } from "../helpers/text";
import type { MutationCommand } from "./types";

export const parseMutationCommand = (rawText: string): MutationCommand => {
  const text = normalizeSpaces(rawText);

  const editLatest = text.match(/^(?:ubah|edit|ganti|koreksi)\s+(?:nominal\s+)?(?:yang\s+)?(?:barusan|terakhir|baru saja)\s+(?:jadi|ke)\s+(.+)$/i);
  if (editLatest) {
    const amount = parsePositiveAmount(editLatest[1]);
    if (!amount) return { kind: "NONE" };
    return { kind: "EDIT", amount, hint: null };
  }

  const editByHint = text.match(/^(?:ubah|edit|ganti|koreksi)\s+(?:nominal\s+)?(.+?)\s+(?:jadi|ke)\s+(.+)$/i);
  if (editByHint) {
    const amount = parsePositiveAmount(editByHint[2]);
    if (!amount) return { kind: "NONE" };
    const hint = normalizeSpaces(editByHint[1]).replace(/\b(tadi|dong|ya)\b/gi, "").trim();
    return { kind: "EDIT", amount, hint: hint || null };
  }

  const deleteLatest = text.match(/^(hapus|delete)\s+(?:yang\s+)?(?:barusan|terakhir|baru saja)$/i);
  if (deleteLatest) {
    return { kind: "DELETE", hint: null };
  }

  const deleteByHint = text.match(/^(hapus|delete)\s+(?:transaksi\s+)?(.+)$/i);
  if (deleteByHint) {
    const hint = normalizeSpaces(deleteByHint[2]).replace(/\b(tadi|dong|ya)\b/gi, "").trim();
    if (!hint) return { kind: "NONE" };
    return { kind: "DELETE", hint };
  }

  return { kind: "NONE" };
};
