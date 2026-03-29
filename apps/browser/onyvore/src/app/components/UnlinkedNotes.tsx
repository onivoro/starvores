import React, { useEffect, useState } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Box,
} from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useRpc, useRpcResponse } from '../hooks/use-rpc-request.hook';
import { onyvoreRpcMethods } from '@onivoro/isomorphic-onyvore';

interface UnlinkedNotesProps {
  notebookId: string;
}

export function UnlinkedNotes({ notebookId }: UnlinkedNotesProps) {
  const { sendRequest } = useRpc();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<string[]>([]);
  const response = useRpcResponse(requestId);

  useEffect(() => {
    const id = sendRequest({
      method: onyvoreRpcMethods.NOTEBOOK_GET_ORPHANS,
      params: { notebookId },
    });
    setRequestId(id);
  }, [notebookId]);

  useEffect(() => {
    if (response?.result) {
      setOrphans((response.result as { orphans: string[] }).orphans);
    }
  }, [response]);

  const handleFileClick = (relativePath: string) => {
    sendRequest({
      method: onyvoreRpcMethods.OPEN_FILE,
      params: { notebookId, relativePath },
    });
  };

  if (orphans.length === 0) return null;

  return (
    <Box>
      <Divider />
      <Typography
        variant="caption"
        sx={{ px: 1, py: 0.5, display: 'block', opacity: 0.6 }}
      >
        Unlinked Notes ({orphans.length})
      </Typography>
      <List dense disablePadding>
        {orphans.map((relPath) => {
          const basename = relPath.replace(/\.md$/, '').split('/').pop() ?? relPath;
          return (
            <ListItem key={relPath} disablePadding>
              <ListItemButton
                onClick={() => handleFileClick(relPath)}
                sx={{ py: 0.25, pl: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <LinkOffIcon fontSize="small" sx={{ opacity: 0.5 }} />
                </ListItemIcon>
                <ListItemText
                  primary={basename}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
