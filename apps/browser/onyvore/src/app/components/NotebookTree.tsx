import React from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  LinearProgress,
  Box,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import type { NotebookInfo, NotebookFile } from '@onivoro/isomorphic-onyvore';
import { useRpc } from '../hooks/use-rpc-request.hook';

interface NotebookTreeProps {
  notebook: NotebookInfo & { files: NotebookFile[] };
}

export function NotebookTree({ notebook }: NotebookTreeProps) {
  const { sendRequest } = useRpc();

  const handleFileClick = (relativePath: string) => {
    sendRequest({
      method: 'openFile',
      params: { notebookId: notebook.id, relativePath },
    });
  };

  return (
    <Box>
      <Typography
        variant="subtitle2"
        sx={{ px: 1, py: 0.5, fontWeight: 'bold', opacity: 0.8 }}
      >
        {notebook.name}
        {notebook.status !== 'ready' && (
          <Typography
            component="span"
            variant="caption"
            sx={{ ml: 1, opacity: 0.6 }}
          >
            ({notebook.status}
            {notebook.progress !== undefined ? ` ${notebook.progress}%` : ''})
          </Typography>
        )}
      </Typography>
      {notebook.status !== 'ready' && notebook.progress !== undefined && (
        <LinearProgress
          variant="determinate"
          value={notebook.progress}
          sx={{ mx: 1, mb: 0.5 }}
        />
      )}
      <List dense disablePadding>
        {notebook.files.map((file) => (
          <ListItem key={file.relativePath} disablePadding>
            <ListItemButton
              onClick={() => handleFileClick(file.relativePath)}
              sx={{ py: 0.25, pl: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                <DescriptionIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={file.basename}
                secondary={
                  file.relativePath.includes('/')
                    ? file.relativePath
                    : undefined
                }
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{
                  variant: 'caption',
                  noWrap: true,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
