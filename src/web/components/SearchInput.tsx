import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
};

export function SearchInput({ value, onChange, placeholder, hint, autoFocus }: Props): React.ReactElement {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(value), [value]);

  const flush = (next: string): void => {
    setLocal(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(next), 200);
  };

  return (
    <div className="space-y-1.5">
      <div className="pb-search w-full max-w-2xl">
        <Search className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />
        <input
          type="search"
          value={local}
          onChange={(e) => flush(e.target.value)}
          placeholder={placeholder ?? "Search jobs…"}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none"
        />
        {local && (
          <button
            type="button"
            onClick={() => {
              flush("");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onChange("");
            }}
            className="text-fg-subtle hover:text-fg"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {hint && <p className="ml-1 text-2xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
