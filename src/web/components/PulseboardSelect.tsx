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
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  menuClassName?: string;
  ariaLabel?: string;
}): React.ReactElement {
  return (
    <Select value={value} onValueChange={(next) => next != null && onChange(next)}>
      <SelectTrigger aria-label={ariaLabel} className={className} size="sm">
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
