import React, { Component, type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Onyvore] React error boundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            Onyvore encountered an error:
          </Typography>
          <Typography
            variant="caption"
            component="pre"
            sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.8 }}
          >
            {this.state.error.message}
          </Typography>
        </Box>
      );
    }
    return this.props.children;
  }
}
