// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

const Utils = {
  // Генерация ID комнаты
  generateRoomId: () => 'room-' + Math.random().toString(36).substring(7),

  // Копирование в буфер обмена
  copyToClipboard: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback для старых браузеров
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (e) {
        document.body.removeChild(textarea);
        return false;
      }
    }
  },

  // Показать уведомление
  showToast: (message, duration = 2000) => {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  },

  // Форматирование времени (MM:SS)
  formatTime: (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  // Получить инициалы из имени
  getInitials: (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  },

  // Случайный цвет для аватара
  getAvatarColor: (seed) => {
    const colors = [
      '#667eea',
      '#764ba2',
      '#48bb78',
      '#fbbf24',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
    ];
    const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  },

  // Сохранение в localStorage
  saveToStorage: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Error saving to storage:', e);
    }
  },

  // Загрузка из localStorage
  loadFromStorage: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error('Error loading from storage:', e);
      return defaultValue;
    }
  },
};
