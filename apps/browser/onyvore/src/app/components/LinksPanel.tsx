import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Box, Typography, Divider } from '@mui/material';
import { useRpc, useRpcResponse } from '../hooks/use-rpc-request.hook';
import { onyvoreRpcMethods, type LinksForNote } from '@onivoro/isomorphic-onyvore';
import type { RootState } from '../state/types/root-state.type';
import { OutboundLinks } from './OutboundLinks';
import { InboundLinks } from './InboundLinks';

export function LinksPanel() {
  const { sendRequest } = useRpc();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [links, setLinks] = useState<LinksForNote | null>(null);
  const response = useRpcResponse(requestId);

  const notebookId = useSelector(
    (state: RootState) => state.activeNotebook.notebookId,
  );
  const activeNotePath = useSelector(
    (state: RootState) => state.activeNotebook.activeNotePath,
  );

  useEffect(() => {
    if (!notebookId || !activeNotePath) {
      setLinks(null);
      return;
    }

    const id = sendRequest({
      method: onyvoreRpcMethods.NOTEBOOK_GET_LINKS,
      params: { notebookId, relativePath: activeNotePath },
    });
    setRequestId(id);
  }, [notebookId, activeNotePath]);

  useEffect(() => {
    if (response?.result) {
      setLinks(response.result as LinksForNote);
    }
  }, [response]);

  if (!notebookId || !activeNotePath) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Open a note to see its links.
        </Typography>
      </Box>
    );
  }

  if (!links) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Loading links...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: 'auto' }}>
      <Typography
        variant="subtitle2"
        sx={{ px: 1, py: 0.5, fontWeight: 'bold', opacity: 0.8 }}
      >
        Outbound Links ({links.outbound.length})
      </Typography>
      <OutboundLinks links={links.outbound} notebookId={notebookId} />

      <Divider sx={{ my: 0.5 }} />

      <Typography
        variant="subtitle2"
        sx={{ px: 1, py: 0.5, fontWeight: 'bold', opacity: 0.8 }}
      >
        Backlinks ({links.inbound.length})
      </Typography>
      <InboundLinks links={links.inbound} notebookId={notebookId} />
    </Box>
  );
}
