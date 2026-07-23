import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

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
    <div className="flex flex-col gap-1.5">
      <InputGroup className="max-w-2xl">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={placeholder ?? "Search"}
          type="search"
          value={local}
          onChange={(e) => flush(e.target.value)}
          placeholder={placeholder ?? "Search jobs…"}
          autoFocus={autoFocus}
          size="sm"
        />
        {local && (
          <Button
            onClick={() => {
              flush("");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onChange("");
            }}
            variant="ghost"
            size="icon-xs"
            aria-label="Clear search"
          >
            <X />
          </Button>
        )}
      </InputGroup>
      {hint && <p className="ml-1 text-2xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
