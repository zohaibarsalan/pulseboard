import { createContext, useContext } from "react";

type Ctx = {
  open: () => void;
};

export const CommandPaletteContext = createContext<Ctx>({
  open: () => undefined,
});

export function useCommandPalette(): Ctx {
  return useContext(CommandPaletteContext);
}
