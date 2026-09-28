import {createApp} from 'vue';
import App from './App.vue';
import DetailPage from './components/DetailPage.vue';
import './styles/style.css';
import './styles/details.css';

createApp(['/gallery', '/image'].includes(window.location.pathname) ? DetailPage : App).mount('#app');
