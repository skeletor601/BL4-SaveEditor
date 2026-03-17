import { useState, useEffect } from "react";

interface RecipeEntry { id: number; n: number; }
interface RecipeGroup { entries: RecipeEntry[]; }
interface GrenadeVisualRecipe {
  id: string;
  label: string;
  notes?: string;
  groups: RecipeGroup[];
}

export interface RecipePart {
  typeId: number;
  partId: number;
  qty: string;
  label: string;
}

interface Props {
  /** Called when the user clicks Load on a recipe. Provides flat SelectedPart-compatible entries in insertion order. */
  onLoad: (parts: RecipePart[]) => void;
}

export default function VisualRecipePanel({ onLoad }: Props) {
  const [recipes, setRecipes] = useState<GrenadeVisualRecipe[]>([]);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/grenade_visual_recipes.json")
      .then((r) => r.json())
      .then((d: GrenadeVisualRecipe[]) => setRecipes(d))
      .catch(() => {});
  }, []);

  const handleLoad = (recipe: GrenadeVisualRecipe) => {
    const parts: RecipePart[] = [];
    for (const group of recipe.groups) {
      for (const entry of group.entries) {
        parts.push({
          typeId: 245,
          partId: entry.id,
          qty: String(entry.n),
          label: `Perk ${entry.id}`,
        });
      }
    }
    onLoad(parts);
    setOpen(false);
  };

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
      >
        <span>Visual Recipes {recipes.length > 0 && <span className="opacity-50 font-normal">({recipes.length})</span>}</span>
        <span className="opacity-40 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="p-2 space-y-1">
          {recipes.length === 0 ? (
            <p className="text-xs opacity-40 py-4 text-center">No recipes loaded.</p>
          ) : (
            recipes.map((recipe) => (
              <div key={recipe.id} className="rounded border border-white/10 bg-white/5 p-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium">{recipe.label}</span>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors opacity-60"
                  >
                    {expandedId === recipe.id ? "▲" : "▼"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoad(recipe)}
                    className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 transition-colors text-green-300"
                  >
                    Load
                  </button>
                </div>
                {expandedId === recipe.id && recipe.notes && (
                  <p className="text-[11px] opacity-60 mt-1 leading-relaxed">{recipe.notes}</p>
                )}
                {expandedId === recipe.id && (
                  <div className="mt-1.5 space-y-0.5">
                    {recipe.groups.map((group, gi) => (
                      <div key={gi} className="flex flex-wrap gap-1">
                        {gi > 0 && (
                          <span className="text-[10px] opacity-40 self-center">— block {gi + 1} —</span>
                        )}
                        {group.entries.map((e, ei) => (
                          <span
                            key={ei}
                            className="text-[10px] font-mono bg-purple-500/10 border border-purple-500/20 rounded px-1 py-0.5 text-purple-300"
                          >
                            {e.id}×{e.n}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
