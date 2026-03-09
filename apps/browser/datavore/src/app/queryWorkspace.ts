export type SqlQueryTab = {
  id: string;
  name: string;
  query: string;
};

export type SqlWorkspaceState = {
  tabs: SqlQueryTab[];
  activeTabId: string;
};

export const QUERY_TABS_STORAGE_PREFIX = 'datavore-query-tabs';
export const PINNED_TABLES_STORAGE_PREFIX = 'datavore-pinned-tables';

const NEW_TAB_NAME_PREFIX = 'Query';

const makeId = (): string => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createTab = (query: string, index: number, name?: string): SqlQueryTab => ({
  id: makeId(),
  name: name?.trim() || `${NEW_TAB_NAME_PREFIX} ${index + 1}`,
  query,
});

export const getTabsStorageKey = (queryStorageKey: string | null): string | null => {
  if (!queryStorageKey) return null;
  return `${QUERY_TABS_STORAGE_PREFIX}:${queryStorageKey}`;
};

export const getPinnedTablesStorageKey = (queryStorageKey: string | null): string | null => {
  if (!queryStorageKey) return null;
  return `${PINNED_TABLES_STORAGE_PREFIX}:${queryStorageKey}`;
};

const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const isValidTab = (value: unknown): value is SqlQueryTab => {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Partial<SqlQueryTab>;
  return typeof tab.id === 'string' && typeof tab.name === 'string' && typeof tab.query === 'string';
};

export const loadWorkspaceState = (
  rawWorkspace: string | null,
  fallbackQuery: string,
): SqlWorkspaceState => {
  const parsed = parseJson<Partial<SqlWorkspaceState>>(rawWorkspace);
  const parsedTabs = Array.isArray(parsed?.tabs) ? parsed.tabs.filter(isValidTab) : [];

  if (!parsedTabs.length) {
    const firstTab = createTab(fallbackQuery, 0, 'Query 1');
    return { tabs: [firstTab], activeTabId: firstTab.id };
  }

  const activeTabId =
    typeof parsed?.activeTabId === 'string' && parsedTabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId
      : parsedTabs[0].id;

  return {
    tabs: parsedTabs,
    activeTabId,
  };
};

export const serializeWorkspaceState = (state: SqlWorkspaceState): string => JSON.stringify(state);

export const getNextTabName = (tabs: SqlQueryTab[]): string => {
  const names = new Set(tabs.map((tab) => tab.name.trim()));
  let idx = tabs.length + 1;
  while (names.has(`${NEW_TAB_NAME_PREFIX} ${idx}`)) {
    idx += 1;
  }
  return `${NEW_TAB_NAME_PREFIX} ${idx}`;
};

export const closeTabInWorkspace = (
  state: SqlWorkspaceState,
  tabId: string,
  fallbackQuery: string,
): SqlWorkspaceState => {
  const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (!nextTabs.length) {
    const firstTab = createTab(fallbackQuery, 0, 'Query 1');
    return { tabs: [firstTab], activeTabId: firstTab.id };
  }

  if (state.activeTabId !== tabId) {
    return { tabs: nextTabs, activeTabId: state.activeTabId };
  }

  const removedIdx = state.tabs.findIndex((tab) => tab.id === tabId);
  const nextActive = nextTabs[Math.min(Math.max(removedIdx - 1, 0), nextTabs.length - 1)]?.id ?? nextTabs[0].id;
  return { tabs: nextTabs, activeTabId: nextActive };
};

export const renameTabInWorkspace = (
  state: SqlWorkspaceState,
  tabId: string,
  name: string,
): SqlWorkspaceState => {
  const nextName = name.trim();
  if (!nextName) return state;

  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, name: nextName } : tab)),
  };
};

export const updateTabQueryInWorkspace = (
  state: SqlWorkspaceState,
  tabId: string,
  query: string,
): SqlWorkspaceState => ({
  ...state,
  tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, query } : tab)),
});

export const loadPinnedTables = (rawValue: string | null): string[] => {
  const parsed = parseJson<unknown>(rawValue);
  if (!Array.isArray(parsed)) return [];
  return Array.from(new Set(parsed.filter((table) => typeof table === 'string' && table.trim()).map(String)));
};

export const serializePinnedTables = (tables: string[]): string => JSON.stringify(Array.from(new Set(tables)));
