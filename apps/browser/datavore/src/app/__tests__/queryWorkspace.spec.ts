import {
  closeTabInWorkspace,
  loadPinnedTables,
  loadWorkspaceState,
  renameTabInWorkspace,
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
});
