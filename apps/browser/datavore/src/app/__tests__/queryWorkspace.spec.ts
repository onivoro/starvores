import {
  addSuccessfulQueryToHistory,
  basicFormatSql,
  clampSqlSplitterRatio,
  closeTabInWorkspace,
  formatSqlWithFallback,
  loadQueryHistory,
  loadSqlSplitterRatio,
  loadPinnedTables,
  loadWorkspaceState,
  renameTabInWorkspace,
  serializeQueryHistory,
  serializeSqlSplitterRatio,
  serializePinnedTables,
  serializeWorkspaceState,
  updateTabQueryInWorkspace,
} from '../queryWorkspace';

describe('queryWorkspace', () => {
  it('migrates fallback query into a default tab when no workspace is present', () => {
    const workspace = loadWorkspaceState(null, 'SELECT 1;');

    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.tabs[0].name).toBe('Query 1');
    expect(workspace.tabs[0].query).toBe('SELECT 1;');
    expect(workspace.activeTabId).toBe(workspace.tabs[0].id);
  });

  it('loads valid workspace and keeps a valid active tab id', () => {
    const initial = loadWorkspaceState(null, 'SELECT 1;');
    const workspace = {
      tabs: [
        { ...initial.tabs[0], name: 'Primary', query: 'SELECT 2;' },
        { id: 'tab-b', name: 'Secondary', query: 'SELECT 3;' },
      ],
      activeTabId: 'tab-b',
    };

    const loaded = loadWorkspaceState(serializeWorkspaceState(workspace), 'SELECT fallback;');

    expect(loaded.tabs).toHaveLength(2);
    expect(loaded.activeTabId).toBe('tab-b');
    expect(loaded.tabs[1].query).toBe('SELECT 3;');
  });

  it('closes active tab and picks a neighboring tab', () => {
    const state = {
      tabs: [
        { id: 'tab-a', name: 'Query 1', query: 'SELECT 1;' },
        { id: 'tab-b', name: 'Query 2', query: 'SELECT 2;' },
        { id: 'tab-c', name: 'Query 3', query: 'SELECT 3;' },
      ],
      activeTabId: 'tab-b',
    };

    const closed = closeTabInWorkspace(state, 'tab-b', 'SELECT fallback;');

    expect(closed.tabs.map((tab) => tab.id)).toEqual(['tab-a', 'tab-c']);
    expect(closed.activeTabId).toBe('tab-a');
  });

  it('renames and updates query immutably', () => {
    const state = {
      tabs: [{ id: 'tab-a', name: 'Query 1', query: 'SELECT 1;' }],
      activeTabId: 'tab-a',
    };

    const renamed = renameTabInWorkspace(state, 'tab-a', ' Users ');
    const updated = updateTabQueryInWorkspace(renamed, 'tab-a', 'SELECT * FROM users;');

    expect(updated.tabs[0].name).toBe('Users');
    expect(updated.tabs[0].query).toBe('SELECT * FROM users;');
    expect(state.tabs[0].name).toBe('Query 1');
  });

  it('loads and serializes pinned tables as unique values', () => {
    const loaded = loadPinnedTables('["users", "orders", "users", "", 123]');

    expect(loaded).toEqual(['users', 'orders']);
    expect(loadPinnedTables(serializePinnedTables(['users', 'orders', 'users']))).toEqual(['users', 'orders']);
  });

  it('stores recent successful queries with dedupe and metadata', () => {
    const first = addSuccessfulQueryToHistory([], 'SELECT * FROM users;', 10, 20);
    const second = addSuccessfulQueryToHistory(first, 'SELECT * FROM orders;', 3, 12);
    const deduped = addSuccessfulQueryToHistory(second, 'SELECT * FROM users;', 11, 24);

    expect(deduped).toHaveLength(2);
    expect(deduped[0].query).toBe('SELECT * FROM users;');
    expect(deduped[0].rowCount).toBe(11);
    expect(deduped[1].query).toBe('SELECT * FROM orders;');
  });

  it('loads and serializes query history', () => {
    const raw = JSON.stringify([
      { id: '1', query: 'SELECT 1;', rowCount: 1, elapsedMs: 2, executedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'bad', query: '', rowCount: 'x' },
    ]);

    const loaded = loadQueryHistory(raw);
    expect(loaded).toEqual([
      { id: '1', query: 'SELECT 1;', rowCount: 1, elapsedMs: 2, executedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(loadQueryHistory(serializeQueryHistory(loaded))).toEqual(loaded);
  });

  it('clamps, loads, and serializes sql splitter ratio', () => {
    expect(clampSqlSplitterRatio(0.1)).toBe(0.25);
    expect(clampSqlSplitterRatio(0.9)).toBe(0.75);
    expect(loadSqlSplitterRatio('0.6')).toBe(0.6);
    expect(loadSqlSplitterRatio('not-a-number')).toBe(0.5);
    expect(serializeSqlSplitterRatio(0.9)).toBe('0.75');
  });

  it('formats sql with fallback formatter', async () => {
    await expect(formatSqlWithFallback('select id, name from users where active = true;')).resolves.toBe(
      'SELECT id, name\nFROM users\nWHERE active = true;',
    );
    await expect(formatSqlWithFallback('select 1;', async () => 'SELECT\n  1;')).resolves.toBe('SELECT\n  1;');
  });

  it('basic formatter normalizes whitespace and uppercases keywords', () => {
    expect(basicFormatSql('  select   *  from users  order   by created_at desc ; ')).toBe(
      'SELECT *\nFROM users\nORDER BY created_at desc ;',
    );
  });
});
