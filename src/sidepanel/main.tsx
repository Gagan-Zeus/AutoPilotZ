import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/index.css';
import { PopupApp } from '../popup/PopupApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp surface="sidepanel" />
  </React.StrictMode>,
);
