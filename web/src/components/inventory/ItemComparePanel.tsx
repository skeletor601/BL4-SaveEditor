import { useMemo } from "react";
import { parseDecodedSerial, translateParts, type TranslatedLine } from "@/lib/partsTranslator";
import { type PartLookupItem } from "@/lib/backpackNaming";

interface CompareItem {
  displayName: string;
  typeLabel: string;
  level: string;
  manufacturer: string;
  decodedFull: string;
}

interface Props {
  itemA: CompareItem;
  itemB: CompareItem;
  partsByCode: Map<string, PartLookupItem>;
}

function getTranslated(item: CompareItem, partsByCode: Map<string, PartLookupItem>): TranslatedLine[] {
  if (!item.decodedFull) return [];
  const { parts } = parseDecodedSerial(item.decodedFull);
  const byCode = new Map<string, import("@/lib/partsTranslator").PartLookupRow[]>();
  partsByCode.forEach((v, k) => byCode.set(k, [v as import("@/lib/partsTranslator").PartLookupRow]));
  return translateParts(parts, byCode);
}

function lineKey(line: TranslatedLine): string {
  return `${line.codeKey}|${line.name}`;
}

export default function ItemComparePanel({ itemA, itemB, partsByCode }: Props) {
  const linesA = useMemo(() => getTranslated(itemA, partsByCode), [itemA.decodedFull, partsByCode]);
  const linesB = useMemo(() => getTranslated(itemB, partsByCode), [itemB.decodedFull, partsByCode]);

  const keysA = useMemo(() => new Set(linesA.map(lineKey)), [linesA]);
  const keysB = useMemo(() => new Set(linesB.map(lineKey)), [linesB]);

  const renderLines = (lines: TranslatedLine[], otherKeys: Set<string>) => (
    <div className="space-y-0.5">
      {lines.length === 0 ? (
        <p className="text-xs opacity-40 py-2 text-center">No parts data</p>
      ) : (
        lines.map((line, i) => {
          const key = lineKey(line);
          const isUnique = !otherKeys.has(key);
          return (
            <div
              key={i}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                isUnique ? "bg-yellow-500/10 border border-yellow-500/20" : ""
              }`}
            >
              <span className="font-mono opacity-50 shrink-0 text-[10px]">{line.codeKey}</span>
              <span className={`flex-1 truncate ${isUnique ? "text-yellow-200" : "opacity-80"}`}>
                {line.name || line.codeKey}
              </span>
              {line.partType && (
                <span className="opacity-40 text-[10px] shrink-0">{line.partType}</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-white/5 border-b border-white/10">
        <span className="text-sm font-medium">Item Comparison</span>
        <span className="text-[10px] opacity-40 ml-2">— yellow = differs between items</span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/10">
        {/* Column A */}
        <div className="p-2 min-w-0">
          <div className="mb-2 pb-1.5 border-b border-white/10">
            <div className="text-xs font-medium text-blue-300 truncate">{itemA.displayName}</div>
            <div className="text-[10px] opacity-50">{itemA.typeLabel} · Lv {itemA.level} · {itemA.manufacturer}</div>
          </div>
          {renderLines(linesA, keysB)}
        </div>

        {/* Column B */}
        <div className="p-2 min-w-0">
          <div className="mb-2 pb-1.5 border-b border-white/10">
            <div className="text-xs font-medium text-green-300 truncate">{itemB.displayName}</div>
            <div className="text-[10px] opacity-50">{itemB.typeLabel} · Lv {itemB.level} · {itemB.manufacturer}</div>
          </div>
          {renderLines(linesB, keysA)}
        </div>
      </div>
    </div>
  );
}
