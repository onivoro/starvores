import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useRpc, useRpcResponse } from '../hooks/use-rpc-request.hook';
import { onyvoreRpcMethods } from '@onivoro/isomorphic-onyvore';
import { searchResultsActions } from '../state/slices/search-results.slice';
import type { RootState } from '../state/types/root-state.type';
import { SearchIcon } from './Icons';

export function SearchOverlay() {
  const dispatch = useDispatch();
  const { sendRequest } = useRpc();
  const inputRef = useRef<HTMLInputElement>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const response = useRpcResponse(requestId);

  const visible = useSelector(
    (state: RootState) => state.searchResults.visible,
  );
  const query = useSelector((state: RootState) => state.searchResults.query);
  const results = useSelector(
    (state: RootState) => state.searchResults.results,
  );
  const notebookId = useSelector(
    (state: RootState) => state.activeNotebook.notebookId,
  );

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  const handleSearch = useCallback(
    (searchQuery: string) => {
      dispatch(searchResultsActions.setQuery(searchQuery));
      if (!notebookId || searchQuery.trim().length === 0) {
        dispatch(searchResultsActions.setResults([]));
        return;
      }

      dispatch(searchResultsActions.setLoading(true));
      const id = sendRequest({
        method: onyvoreRpcMethods.NOTEBOOK_SEARCH,
        params: { notebookId, query: searchQuery },
      });
      setRequestId(id);
    },
    [notebookId, sendRequest, dispatch],
  );

  useEffect(() => {
    if (response?.result) {
      const data = response.result as {
        results: Array<{ relativePath: string; title: string; score: number }>;
      };
      dispatch(searchResultsActions.setResults(data.results));
    }
  }, [response, dispatch]);

  const handleResultClick = (relativePath: string) => {
    sendRequest({
      method: onyvoreRpcMethods.OPEN_FILE,
      params: { notebookId, relativePath },
    });
    dispatch(searchResultsActions.hide());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      dispatch(searchResultsActions.hide());
    }
  };

  if (!visible) return null;

  return (
    <div className="ony-search">
      <div className="ony-search__field">
        <span className="ony-search__icon">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          className="ony-search__input"
          type="text"
          placeholder={notebookId ? 'Search notes...' : 'No active notebook'}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!notebookId}
        />
      </div>
      {results.length > 0 && (
        <ul className="ony-search__results">
          {results.map((result) => (
            <li
              key={result.relativePath}
              className="ony-search__result"
              tabIndex={0}
              role="button"
              onClick={() => handleResultClick(result.relativePath)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  handleResultClick(result.relativePath);
              }}
            >
              <span className="ony-search__result-title">{result.title}</span>
              <span className="ony-search__result-path">
                {result.relativePath}
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.length > 0 && results.length === 0 && (
        <div className="ony-search__empty">No results found</div>
      )}
    </div>
  );
}
