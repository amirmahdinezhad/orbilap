import { createContext, useContext } from "react";
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from "./displayPrefs";

export const DisplayPrefsContext = createContext<Pick<DisplayPrefs, "deadlineDisplay" | "timeFormat">>(DEFAULT_DISPLAY_PREFS);
export const useTimeDisplay = () => useContext(DisplayPrefsContext);
