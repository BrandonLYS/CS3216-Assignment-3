"use client";

import * as React from "react";

/** Shell-level commands any feature may trigger; the AppShell widget provides the implementation. */
export interface ShellCtx {
  openPalette: () => void;
  openNewProject: () => void;
  assistantOpen: boolean;
  toggleAssistant: () => void;
}

export const ShellContext = React.createContext<ShellCtx>({
  openPalette: () => {},
  openNewProject: () => {},
  assistantOpen: false,
  toggleAssistant: () => {},
});
export const useShell = () => React.useContext(ShellContext);
