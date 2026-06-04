import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button, Input } from "./coss-ui/index.js";

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
        <Input
          type="search"
          value={local}
          onChange={(e) => flush(e.target.value)}
          placeholder={placeholder ?? "Search jobs…"}
          autoFocus={autoFocus}
          className="h-auto flex-1 border-0 bg-transparent px-0 text-sm focus:ring-0"
        />
        {local && (
          <Button
            onClick={() => {
              flush("");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onChange("");
            }}
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {hint && <p className="ml-1 text-2xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
