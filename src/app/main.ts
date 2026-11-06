import '@1337exp/taoui/styles.css';
import { createApp } from 'vue';
import App from './App.vue';
import { initI18n } from './i18n';
import './styles.css';
import { initTheme } from './theme';

initI18n();
initTheme();

createApp(App).mount('#app');
