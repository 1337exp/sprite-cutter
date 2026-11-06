import { registerTaoIcons } from '@1337exp/taoui';
import '@1337exp/taoui/styles.css';
import { createApp } from 'vue';
import App from './App.vue';
import { initI18n } from './i18n';
import './styles.css';
import { initTheme } from './theme';

// The pipette is not among the built-in icons; drawn like them: 24 grid, 2px round stroke, currentColor.
registerTaoIcons({
    eyedropper: { body: '<path d="M5 19l7.5-7.5"/><path d="M10.5 9.5l4 4"/><path d="M14.5 8.5l2.5-2.5a2.1 2.1 0 013 3l-2.5 2.5z"/><path d="M4 20l1-1"/>' },
});

initI18n();
initTheme();

createApp(App).mount('#app');
