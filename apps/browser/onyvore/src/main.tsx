import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { ThemeProvider, createTheme } from '@mui/material';
import { Provider } from 'react-redux';
import { store } from './app/state/store';
import { ErrorBoundary } from './app/components/ErrorBoundary';

console.log('[Onyvore] Webview script loaded');

const theme = createTheme();

try {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    console.error('[Onyvore] #root element not found');
  } else {
    console.log('[Onyvore] Mounting React app');
    const root = ReactDOM.createRoot(rootEl);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <Provider store={store}>
            <ThemeProvider theme={theme}>
              <MemoryRouter>
                <App />
              </MemoryRouter>
            </ThemeProvider>
          </Provider>
        </ErrorBoundary>
      </StrictMode>,
    );
    console.log('[Onyvore] React app rendered');
  }
} catch (err) {
  console.error('[Onyvore] Fatal initialization error:', err);
  const rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.textContent = `Onyvore failed to initialize: ${err}`;
  }
}
