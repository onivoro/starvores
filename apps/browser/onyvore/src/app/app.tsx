import React from 'react';
import { Box } from '@mui/material';
import { NotebookSidebar } from './components/NotebookSidebar';
import { LinksPanel } from './components/LinksPanel';
import { SearchOverlay } from './components/SearchOverlay';

export default function App() {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'var(--vscode-sideBar-background, inherit)',
        color: 'var(--vscode-sideBar-foreground, inherit)',
      }}
    >
      <SearchOverlay />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <NotebookSidebar />
      </Box>
      <Box
        sx={{
          borderTop: '1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.1))',
          maxHeight: '40%',
          overflow: 'auto',
        }}
      >
        <LinksPanel />
      </Box>
    </Box>
  );
}
