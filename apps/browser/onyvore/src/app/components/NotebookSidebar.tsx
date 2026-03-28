import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Box, Typography, Divider } from '@mui/material';
import { useRpc, useRpcResponse } from '../hooks/use-rpc-request.hook';
import { onyvoreRpcMethods } from '@onivoro/isomorphic-onyvore';
import type { RootState } from '../state/types/root-state.type';
import { notebooksActions } from '../state/slices/notebooks.slice';
import { NotebookTree } from './NotebookTree';
import { UnlinkedNotes } from './UnlinkedNotes';

export function NotebookSidebar() {
  const dispatch = useDispatch();
  const { sendRequest } = useRpc();
  const [requestId, setRequestId] = useState<string | null>(null);
  const notebooks = useSelector((state: RootState) => state.notebooks.notebooks);
  const loading = useSelector((state: RootState) => state.notebooks.loading);
  const response = useRpcResponse(requestId);

  useEffect(() => {
    const id = sendRequest({
      method: onyvoreRpcMethods.NOTEBOOK_GET_NOTEBOOKS,
    });
    setRequestId(id);
  }, []);

  // Re-fetch when loading flag is set (triggered by notifications)
  useEffect(() => {
    if (loading) {
      const id = sendRequest({
        method: onyvoreRpcMethods.NOTEBOOK_GET_NOTEBOOKS,
      });
      setRequestId(id);
    }
  }, [loading]);

  // When response arrives, push data into the notebooks slice
  useEffect(() => {
    if (response?.result) {
      const data = response.result as { notebooks: any[] };
      dispatch(notebooksActions.setNotebooks(data.notebooks ?? []));
    }
  }, [response, dispatch]);

  if (notebooks.length === 0) {
    return (
      <Box
        sx={{
          p: 2,
          textAlign: 'center',
          color: 'var(--vscode-foreground, inherit)',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            mb: 1,
            color: 'var(--vscode-foreground, inherit)',
            opacity: 0.9,
          }}
        >
          No notebooks found
        </Typography>
        <Typography
          variant="caption"
          component="div"
          sx={{
            color: 'var(--vscode-descriptionForeground, inherit)',
            lineHeight: 1.6,
          }}
        >
          Open a folder containing Markdown files, then run{' '}
          <strong>Onyvore: Initialize Notebook</strong> from the Command Palette
          (Cmd+Shift+P).
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: 'auto', height: '100%' }}>
      {notebooks.map((notebook, index) => (
        <Box key={notebook.id}>
          {index > 0 && <Divider />}
          <NotebookTree notebook={notebook} />
          <UnlinkedNotes notebookId={notebook.id} />
        </Box>
      ))}
    </Box>
  );
}
