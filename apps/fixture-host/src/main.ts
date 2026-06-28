import { renderApp } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

renderApp(root);
