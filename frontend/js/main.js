// ========== ГЛАВНЫЙ ФАЙЛ ПРИЛОЖЕНИЯ ==========
async function checkMediaPipeStatus() {
  try {
    const response = await fetch('http://localhost:8080/mediapipe/status');
    const status = await response.json();
    console.log('MediaPipe статус:', status);
  } catch (error) {
    console.log('MediaPipe сервер не доступен');
  }
}

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
  checkMediaPipeStatus();
});

// Обработка ошибок
window.addEventListener('error', (event) => {
  console.error('❌ Глобальная ошибка:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Необработанный промис:', event.reason);
});
