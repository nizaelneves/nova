import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Refine } from './Refine';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Refine />
  </StrictMode>,
);
