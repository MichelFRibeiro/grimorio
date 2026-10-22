import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './hooks/useAuth';
import './styles/index.css';
/* Os quatro temas ficam no mesmo bundle; cada skin se declara em
   html[data-theme="..."] e o index.html já aplica o escolhido antes de pintar
   a página. A ordem importa: estas skins vêm depois de index.css. */
import './styles/themes/claro/skin.css';
import './styles/themes/lousa/skin.css';
import './styles/themes/atlas/skin.css';
import './styles/themes/terminal/skin.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
