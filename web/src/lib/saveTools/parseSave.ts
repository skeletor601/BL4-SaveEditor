/**
 * Stub: BL4 save file parser.
 * TODO: Port decoder logic from bl4_decoder_py / decoder_logic.py.
 * Parse .sav binary or exported format; return structured data for UI.
 */

export interface ParsedSave {
  character?: unknown;
  inventory?: unknown;
  raw?: unknown;
}

export function parseSaveFile(_buffer: ArrayBuffer): ParsedSave {
  // TODO: Implement actual BL4 save parsing (client-side only).
  return {};
}
