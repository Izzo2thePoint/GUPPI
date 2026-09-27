import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import MobileApp from './app';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
);
