import React from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Chip,
  Box,
} from '@mui/material';
import { onyvoreRpcMethods, type LinkEntry } from '@onivoro/isomorphic-onyvore';
import { useRpc } from '../hooks/use-rpc-request.hook';

interface InboundLinksProps {
  links: LinkEntry[];
  notebookId: string;
}

export function InboundLinks({ links, notebookId }: InboundLinksProps) {
  const { sendRequest } = useRpc();

  const handleClick = (relativePath: string) => {
    sendRequest({
      method: onyvoreRpcMethods.OPEN_FILE,
      params: { notebookId, relativePath },
    });
  };

  if (links.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        No backlinks
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {links.map((link) => (
        <ListItem key={link.notePath} disablePadding>
          <ListItemButton
            onClick={() => handleClick(link.notePath)}
            sx={{ py: 0.25 }}
          >
            <ListItemText
              primary={
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                    {link.noteTitle}
                  </Typography>
                  <Chip
                    label={`${link.noun} (${link.count})`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 18 }}
                  />
                </Box>
              }
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}
