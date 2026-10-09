import {initializeTheme} from './lib/theme.js';
import { createApp } from 'vue';
import DevelopmentLog from './components/DevelopmentLog.vue';
import './styles/style.css';
import './styles/developmentLog.css';

initializeTheme();

createApp(DevelopmentLog).mount('#app');
