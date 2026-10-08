import {createApp, watchEffect} from 'vue';
import {privacyMode} from './lib/privacyMode.js';
import App from './App.vue';
import DetailPage from './components/DetailPage.vue';
import './styles/style.css';
import './styles/details.css';
import './styles/privacyMode.css';

watchEffect(() => document.documentElement.classList.toggle('privacy-mode', privacyMode.value));

createApp(['/gallery', '/image'].includes(window.location.pathname) ? DetailPage : App).mount('#app');
