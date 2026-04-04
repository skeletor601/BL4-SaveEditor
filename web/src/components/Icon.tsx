/**
 * Theme-aware SVG icon component.
 * Loads SVGs from /icons/ directory. Uses currentColor for theme integration.
 */

import { useEffect, useState } from "react";

const ICON_CACHE: Record<string, string> = {};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 20, className = "", style }: IconProps) {
  const [svg, setSvg] = useState<string>(ICON_CACHE[name] ?? "");

  useEffect(() => {
    if (ICON_CACHE[name]) {
      setSvg(ICON_CACHE[name]);
      return;
    }
    fetch(`/icons/${name}.svg`)
      .then((r) => r.text())
      .then((text) => {
        ICON_CACHE[name] = text;
        setSvg(text);
      })
      .catch(() => {});
  }, [name]);

  if (!svg) return <span style={{ width: size, height: size, display: "inline-block" }} />;

  // Add width/height and ensure no fill on the root svg element
  let processed = svg
    .replace(/<svg/, `<svg width="${size}" height="${size}" style="display:block"`)
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 leading-none ${className}`}
      style={{ width: size, height: size, lineHeight: 0, background: "none", ...style }}
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
}
