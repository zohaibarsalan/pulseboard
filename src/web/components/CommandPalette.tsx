import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Activity, Moon, Send, Settings, Sun, Webhook, type LucideIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ open, onClose }: Props): React.ReactElement {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const go = (href: string): void => {
    setLocation(href);
    onClose();
  };

  const toggleTheme = (): void => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("pb-theme", next ? "dark" : "light");
    onClose();
  };

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <CommandDialogPopup>
        <Command>
          <CommandInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Go to a page or action…"
          />
          <CommandPanel>
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                <CommandGroupLabel>Pages</CommandGroupLabel>
                <PaletteItem icon={Webhook} label="Webhooks" onSelect={() => go("/")} />
                <PaletteItem icon={Send} label="Compose" onSelect={() => go("/compose")} />
                <PaletteItem icon={Activity} label="Analytics" onSelect={() => go("/analytics")} />
                <PaletteItem icon={Settings} label="Settings" onSelect={() => go("/settings")} />
              </CommandGroup>
              <CommandGroup>
                <CommandGroupLabel>Preferences</CommandGroupLabel>
                <PaletteItem
                  icon={isDark ? Sun : Moon}
                  label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  onSelect={toggleTheme}
                />
              </CommandGroup>
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd><span>navigate</span></KbdGroup>
            <KbdGroup><Kbd>↵</Kbd><span>select</span><Kbd>esc</Kbd><span>close</span></KbdGroup>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function PaletteItem({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <CommandItem value={label} onClick={onSelect}>
      <Icon />
      <span className="flex-1 truncate">{label}</span>
    </CommandItem>
  );
}
