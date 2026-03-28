import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useRpc, useRpcResponse } from '../hooks/use-rpc-request.hook';
import { onyvoreRpcMethods } from '@onivoro/isomorphic-onyvore';
import { searchResultsActions } from '../state/slices/search-results.slice';
import type { RootState } from '../state/types/root-state.type';

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
      method: 'openFile',
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
    <Paper
      elevation={4}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        maxHeight: '80vh',
        overflow: 'auto',
      }}
    >
      <Box sx={{ p: 1 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder={
            notebookId ? 'Search notes...' : 'No active notebook'
          }
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!notebookId}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      {results.length > 0 && (
        <List dense disablePadding>
          {results.map((result) => (
            <ListItem key={result.relativePath} disablePadding>
              <ListItemButton
                onClick={() => handleResultClick(result.relativePath)}
              >
                <ListItemText
                  primary={result.title}
                  secondary={result.relativePath}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
      {query.length > 0 && results.length === 0 && (
        <Box sx={{ p: 1, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            No results found
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
