import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applySettings, useSettings } from './settings/settingsStore';
import './ui/theme/tokens.css';
import './ui/theme/base.css';
import './ui/theme/ui.css';
import './theme/app.css';

const params = new URLSearchParams(window.location.search);
applySettings(useSettings.getState());

// ?gallery shows every ui primitive in every state, for design review and visual tests.
const Gallery = lazy(() => import('./ui/Gallery').then((m) => ({ default: m.Gallery })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {params.has('gallery') ? (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
