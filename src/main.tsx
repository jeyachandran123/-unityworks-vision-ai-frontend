import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from '@app/providers/Providers';
import { AppRouter } from '@app/router/AppRouter';
import { initTheme } from '@shared/theme/theme';
// The one typeface, bundled and served from this origin (see tokens.css). The
// optical-size build: one file gives titles the display cut and text the text cut.
import '@fontsource-variable/inter/opsz.css';
import './styles/global.css';
import './styles/components.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

// Normally a no-op: the inline script in index.html has already resolved and
// applied the same decision before first paint. This is what keeps the root
// element correct when that script did not run.
initTheme();

createRoot(container).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
