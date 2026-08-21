import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from '@app/providers/Providers';
import { AppRouter } from '@app/router/AppRouter';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
