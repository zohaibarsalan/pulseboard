import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = {
  value: string;
  label: React.ReactNode;
};

export function PulseboardSelect({
  value,
  options,
  onChange,
  className,
  menuClassName,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  menuClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <Select value={value} disabled={disabled} onValueChange={(next) => next != null && onChange(next)}>
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={menuClassName}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
