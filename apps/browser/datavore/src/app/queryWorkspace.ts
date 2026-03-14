export type SqlQueryTab = {
  id: string;
  name: string;
  query: string;
};

export type SqlWorkspaceState = {
  tabs: SqlQueryTab[];
  activeTabId: string;
};

export type SqlQueryHistoryItem = {
  id: string;
  query: string;
  rowCount: number;
  elapsedMs: number;
  executedAt: string;
};

export const QUERY_TABS_STORAGE_PREFIX = 'datavore-query-tabs';
export const PINNED_TABLES_STORAGE_PREFIX = 'datavore-pinned-tables';
export const QUERY_HISTORY_STORAGE_PREFIX = 'datavore-query-history';
export const SQL_SPLITTER_STORAGE_PREFIX = 'datavore-sql-splitter';
export const DEFAULT_SQL_SPLITTER_RATIO = 0.5;
export const MIN_SQL_SPLITTER_RATIO = 0.25;
export const MAX_SQL_SPLITTER_RATIO = 0.75;
export const MAX_QUERY_HISTORY_ITEMS = 30;

const NEW_TAB_NAME_PREFIX = 'Query';

const makeId = (): string => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makeHistoryId = (): string => `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

export const getQueryHistoryStorageKey = (queryStorageKey: string | null): string | null => {
  if (!queryStorageKey) return null;
  return `${QUERY_HISTORY_STORAGE_PREFIX}:${queryStorageKey}`;
};

export const getSqlSplitterStorageKey = (queryStorageKey: string | null): string | null => {
  if (!queryStorageKey) return null;
  return `${SQL_SPLITTER_STORAGE_PREFIX}:${queryStorageKey}`;
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

const isValidHistoryItem = (value: unknown): value is SqlQueryHistoryItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SqlQueryHistoryItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.query === 'string' &&
    typeof item.rowCount === 'number' &&
    Number.isFinite(item.rowCount) &&
    typeof item.elapsedMs === 'number' &&
    Number.isFinite(item.elapsedMs) &&
    typeof item.executedAt === 'string'
  );
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

export const loadQueryHistory = (rawValue: string | null): SqlQueryHistoryItem[] => {
  const parsed = parseJson<unknown>(rawValue);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidHistoryItem).slice(0, MAX_QUERY_HISTORY_ITEMS);
};

export const serializeQueryHistory = (history: SqlQueryHistoryItem[]): string => JSON.stringify(history);

export const addSuccessfulQueryToHistory = (
  history: SqlQueryHistoryItem[],
  query: string,
  rowCount: number,
  elapsedMs: number,
): SqlQueryHistoryItem[] => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return history;

  const nextItem: SqlQueryHistoryItem = {
    id: makeHistoryId(),
    query: trimmedQuery,
    rowCount: Math.max(0, Math.floor(rowCount)),
    elapsedMs: Math.max(0, Math.floor(elapsedMs)),
    executedAt: new Date().toISOString(),
  };

  const deduped = history.filter((item) => item.query !== trimmedQuery);
  return [nextItem, ...deduped].slice(0, MAX_QUERY_HISTORY_ITEMS);
};

export const clampSqlSplitterRatio = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_SQL_SPLITTER_RATIO;
  return Math.min(MAX_SQL_SPLITTER_RATIO, Math.max(MIN_SQL_SPLITTER_RATIO, value));
};

export const loadSqlSplitterRatio = (rawValue: string | null): number => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return DEFAULT_SQL_SPLITTER_RATIO;
  return clampSqlSplitterRatio(Number(rawValue));
};

export const serializeSqlSplitterRatio = (ratio: number): string => String(clampSqlSplitterRatio(ratio));

const SQL_KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'on',
  'group',
  'by',
  'order',
  'having',
  'limit',
  'offset',
  'insert',
  'into',
  'values',
  'update',
  'set',
  'delete',
  'create',
  'table',
  'alter',
  'drop',
  'union',
  'all',
  'distinct',
  'and',
  'or',
  'case',
  'when',
  'then',
  'else',
  'end',
  'as',
]);

const BREAK_BEFORE = new Set([
  'select',
  'from',
  'where',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'insert',
  'update',
  'delete',
  'values',
  'set',
  'union',
]);

export const basicFormatSql = (query: string): string => {
  const normalized = query
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();

  if (!normalized) return '';

  const words = normalized.split(' ');
  const lines: string[] = [];

  words.forEach((word, index) => {
    const bareWord = word.replace(/[^a-z]/gi, '').toLowerCase();
    const normalizedWord = SQL_KEYWORDS.has(bareWord) ? word.toUpperCase() : word;
    if (index === 0) {
      lines.push(normalizedWord);
      return;
    }
    if (BREAK_BEFORE.has(bareWord)) {
      lines.push(normalizedWord);
      return;
    }
    lines[lines.length - 1] = `${lines[lines.length - 1]} ${normalizedWord}`;
  });

  return lines.join('\n').replace(/\n+/g, '\n').trim();
};

export type PgFormatterFn = (query: string) => string | Promise<string>;

export const formatSqlWithFallback = async (query: string, pgFormatter?: PgFormatterFn | null): Promise<string> => {
  const trimmed = query.trim();
  if (!trimmed) return '';

  if (pgFormatter) {
    const formatted = await pgFormatter(query);
    if (typeof formatted === 'string' && formatted.trim()) {
      return formatted;
    }
  }

  return basicFormatSql(query);
};
