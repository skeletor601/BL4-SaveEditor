interface LegendaryBadgeProps {
  rarity: string;
  /** When true, use legendary orange styling. */
  isLegendary?: boolean;
  /** When true, use pearl cyan styling. */
  isPearl?: boolean;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—";
}

export default function LegendaryBadge({ rarity, isLegendary, isPearl }: LegendaryBadgeProps) {
  const display = rarity ? capitalize(rarity) : "—";
  if (isPearl) {
    return (
      <span className="font-semibold text-sky-300">
        {display}
      </span>
    );
  }
  if (isLegendary) {
    return (
      <span className="font-semibold text-[var(--color-legendary)]">
        {display}
      </span>
    );
  }
  return <span>{display}</span>;
}
