import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

type ThemePalette = {
  primary: string;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
};

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const fallbackPalette: ThemePalette = {
  primary: "#4A90D9",
  background: "#0d111d",
  surface: "#161b26",
  foreground: "#ffffff",
  muted: "#8e9aa8",
  border: "rgba(255,255,255,0.1)",
  success: "#4CAF50",
  warning: "#FF9800",
  error: "#F44336",
};

function normalizeScheme(scheme: unknown): ColorScheme {
  return scheme === "dark" ? "dark" : "light";
}

function getPalette(scheme: ColorScheme): ThemePalette {
  return {
    ...fallbackPalette,
    ...SchemeColors[scheme],
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = normalizeScheme(useSystemColorScheme());
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(systemScheme);

  const applyScheme = useCallback((scheme: ColorScheme) => {
    const safeScheme = normalizeScheme(scheme);
    const palette = getPalette(safeScheme);

    try {
      nativewindColorScheme.set(safeScheme);
      Appearance.setColorScheme?.(safeScheme);
    } catch (e) {
      console.warn("Failed to apply native theme:", e);
    }
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = safeScheme;
      root.classList.toggle("dark", safeScheme === "dark");
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    const safeScheme = normalizeScheme(scheme);
    setColorSchemeState(safeScheme);
    applyScheme(safeScheme);
  }, [applyScheme]);

  useEffect(() => {
    applyScheme(colorScheme);
  }, [applyScheme, colorScheme]);

  const themeVariables = useMemo(
    () => {
      const palette = getPalette(colorScheme);
      return vars({
        "color-primary": palette.primary,
        "color-background": palette.background,
        "color-surface": palette.surface,
        "color-foreground": palette.foreground,
        "color-muted": palette.muted,
        "color-border": palette.border,
        "color-success": palette.success,
        "color-warning": palette.warning,
        "color-error": palette.error,
      });
    },
    [colorScheme],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
    }),
    [colorScheme, setColorScheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
