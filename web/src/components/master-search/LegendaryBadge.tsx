interface LegendaryBadgeProps {
  rarity: string;
  /** When true, use legendary orange styling (scarlett .legendary-row) */
  isLegendary?: boolean;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—";
}

export default function LegendaryBadge({ rarity, isLegendary }: LegendaryBadgeProps) {
  const display = rarity ? capitalize(rarity) : "—";
  if (isLegendary) {
    return (
      <span className="font-semibold text-[var(--color-legendary)]">
        {display}
      </span>
    );
  }
  return <span>{display}</span>;
}
