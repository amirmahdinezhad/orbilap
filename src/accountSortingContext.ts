import { createContext, useContext } from "react";
import { DEFAULT_ACCOUNT_SORT, type AccountSortPreference } from "./accountSort";

interface SortingContext {
  preference: AccountSortPreference;
  revision: number;
  animate: boolean;
  register: (capture: () => void) => () => void;
}
/** Keep provider and consumers on one module identity through component Fast Refresh. */
export const AccountSortingContext = createContext<SortingContext>({ preference: DEFAULT_ACCOUNT_SORT, revision: 0, animate: false, register: () => () => {} });
export function useAccountSorting() { return useContext(AccountSortingContext); }
