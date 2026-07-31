// Вспомогательные функции
const Utils = {
  generateRoomId: () => 'room-' + Math.random().toString(36).substring(7),

  copyToClipboard: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  },

  showToast: (message, duration = 2000) => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  },

  formatTime: (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  saveToStorage: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Ошибка сохранения ${key}:`, e);
    }
  },

  loadFromStorage: (key, defaultValue = null) => {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return defaultValue;
      return JSON.parse(value);
    } catch (e) {
      console.warn(`Ошибка загрузки ${key} из storage:`, e);
      return defaultValue;
    }
  },
};
