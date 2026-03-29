import { useState, useCallback, useRef } from 'react';
import { useRpc, useRpcResponse } from '../hooks/use-rpc-request.hook';
import { onyvoreRpcMethods } from '@onivoro/isomorphic-onyvore';
import { SearchIcon } from './Icons';

interface SearchBarProps {
  notebookId: string | null;
}

export function SearchBar({ notebookId }: SearchBarProps) {
  const { sendRequest } = useRpc();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    Array<{ relativePath: string; title: string; score: number }>
  >([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const response = useRpcResponse(requestId);

  if (response?.result && requestId) {
    const data = response.result as {
      results: Array<{ relativePath: string; title: string; score: number }>;
    };
    setResults(data.results);
    setRequestId(null);
  }

  const handleSearch = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);
      if (!notebookId || searchQuery.trim().length === 0) {
        setResults([]);
        return;
      }
      const id = sendRequest({
        method: onyvoreRpcMethods.NOTEBOOK_SEARCH,
        params: { notebookId, query: searchQuery },
      });
      setRequestId(id);
    },
    [notebookId, sendRequest],
  );

  const handleResultClick = (relativePath: string) => {
    sendRequest({
      method: onyvoreRpcMethods.OPEN_FILE,
      params: { notebookId, relativePath },
    });
    setQuery('');
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
      inputRef.current?.blur();
    }
  };

  return (
    <>
      <div className="ony-searchbar">
        <span className="ony-searchbar__icon">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          className="ony-searchbar__input"
          type="text"
          placeholder={notebookId ? 'Search notes...' : 'No notebook selected'}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!notebookId}
        />
      </div>
      {results.length > 0 && (
        <ul className="ony-searchbar__results">
          {results.map((result) => (
            <li
              key={result.relativePath}
              className="ony-searchbar__result"
              tabIndex={0}
              role="button"
              onClick={() => handleResultClick(result.relativePath)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleResultClick(result.relativePath);
              }}
            >
              <span className="ony-searchbar__result-title">
                {result.title}
              </span>
              <span className="ony-searchbar__result-path">
                {result.relativePath}
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.length > 0 && results.length === 0 && (
        <div className="ony-searchbar__empty">No results found</div>
      )}
    </>
  );
}
