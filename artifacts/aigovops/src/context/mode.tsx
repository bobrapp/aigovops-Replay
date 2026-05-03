import { createContext, useContext, useState, ReactNode } from "react";

type Mode = "expert" | "simple";

interface ModeContextValue {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeContext = createContext<ModeContextValue>({
  mode: "simple",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const stored = localStorage.getItem("aigovops-mode");
      return stored === "expert" ? "expert" : "simple";
    } catch {
      return "simple";
    }
  });

  function setMode(m: Mode) {
    setModeState(m);
    try {
      localStorage.setItem("aigovops-mode", m);
    } catch {}
  }

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
