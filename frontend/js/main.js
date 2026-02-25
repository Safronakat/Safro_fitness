// ========== ГЛАВНЫЙ ФАЙЛ ПРИЛОЖЕНИЯ ==========

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Safro Fitness инициализирован');

  // Показываем страницу входа
  UI.showLandingPage();

  // Инициализируем обработчики событий
  UI.initEventListeners();

  // Подключаемся к сигнальному серверу
  WebRTC.connect();

  // Загружаем сохраненные настройки
  const savedName = Utils.loadFromStorage('userName', '');
  if (savedName) {
    document.getElementById('userName').value = savedName;
  }
});

// Обработка ошибок
window.addEventListener('error', (event) => {
  console.error('❌ Глобальная ошибка:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Необработанный промис:', event.reason);
});
