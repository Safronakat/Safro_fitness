// UI - управление интерфейсом
const UI = {
  // Состояние
  currentView: 'landing', // 'landing' или 'room'
  isTrainer: false, // создатель комнаты = тренер
  userName: '',
  roomId: '',
  participants: new Map(), // id -> { name, audio, video, isSpeaker }
  localVideoElement: null,
  timerInterval: null,
  timerSeconds: 0,
  trainerId: null, // ID создателя комнаты

  // Инициализация обработчиков событий
  initEventListeners() {
    // Страница входа
    document.getElementById('themeToggle').addEventListener('click', this.toggleTheme);
    document.getElementById('createRoomBtn').addEventListener('click', () => this.onCreateRoom());
    document.getElementById('joinRoomBtn').addEventListener('click', () => this.onJoinRoom());
    document.getElementById('roomIdInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.onJoinRoom();
    });
    document.getElementById('userName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.onCreateRoom();
    });

    // Комната - верхняя панель
    document.getElementById('copyRoomId').addEventListener('click', () => this.copyRoomId());
    document
      .getElementById('toggleParticipants')
      .addEventListener('click', () => this.toggleParticipantsPanel());
    document.getElementById('exitRoomBtn').addEventListener('click', () => this.showExitConfirm());

    // Панель участников
    document
      .getElementById('toggleParticipantsBtn')
      .addEventListener('click', () => this.toggleParticipantsPanel());
    document
      .getElementById('closePanel')
      .addEventListener('click', () => this.toggleParticipantsPanel());

    // Управление медиа
    document.getElementById('toggleMic').addEventListener('click', () => WebRTC.toggleMic());
    document.getElementById('toggleCam').addEventListener('click', () => WebRTC.toggleCam());
    document.getElementById('shareScreen').addEventListener('click', () => WebRTC.shareScreen());

    // Модальные окна
    document
      .getElementById('modalCancel')
      .addEventListener('click', () => this.hideModal('confirmModal'));
    document.getElementById('modalConfirm').addEventListener('click', () => this.onExitConfirmed());
    document
      .getElementById('permissionDeny')
      .addEventListener('click', () => this.hideModal('permissionModal'));
    document
      .getElementById('permissionAllow')
      .addEventListener('click', () => this.onPermissionAllow());

    // Дополнительные кнопки
    document.getElementById('chatBtn').addEventListener('click', () => this.showChat());
    document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
    document.getElementById('aiBtn').addEventListener('click', () => this.startAIAnalysis());
  },

  // Переключение темы
  toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  },

  // Показать страницу входа
  showLandingPage() {
    document.getElementById('landingPage').style.display = 'flex';
    document.getElementById('roomPage').style.display = 'none';
    this.currentView = 'landing';

    // Загружаем сохраненное имя
    const savedName = localStorage.getItem('userName');
    if (savedName) {
      document.getElementById('userName').value = savedName;
    }

    // Загружаем тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  },

  // Показать комнату
  showRoom(roomId, isTrainer = false) {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('roomPage').style.display = 'flex';
    this.currentView = 'room';
    this.isTrainer = isTrainer;
    this.roomId = roomId;

    // Отображаем ID комнаты
    document.getElementById('displayRoomId').textContent = roomId;

    // Запускаем таймер
    this.startTimer();

    // Настраиваем отображение видео в зависимости от роли
    this.setupVideoLayout();
  },

  // Настройка раскладки видео
  setupVideoLayout() {
    const videoArea = document.getElementById('videoArea');
    videoArea.innerHTML = '';

    if (this.isTrainer) {
      // Режим тренера - сетка
      videoArea.className = 'video-area';
      videoArea.style.display = 'grid';
      videoArea.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
      videoArea.style.gap = '10px';
      videoArea.style.padding = '10px';
    } else {
      // Режим ученика - тренер крупно, остальные справа колонкой
      videoArea.className = 'video-area';
      videoArea.style.display = 'flex';
      videoArea.style.gap = '10px';
      videoArea.style.padding = '10px';

      videoArea.innerHTML = `
                <div class="trainer-video" id="trainerVideo" style="flex: 3; min-width: 0;"></div>
                <div class="other-participants" id="otherParticipants" style="flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 100%; min-width: 200px;"></div>
            `;
    }
  },

  // Добавить видео участника
  addVideoStream(peerId, stream, isLocal = false, userName = '') {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video-${peerId}`;

    // Стили для контейнера
    videoContainer.style.position = 'relative';
    videoContainer.style.background = '#1a202c';
    videoContainer.style.borderRadius = '12px';
    videoContainer.style.overflow = 'hidden';
    videoContainer.style.aspectRatio = '16/9';
    videoContainer.style.border = '3px solid transparent';

    if (isLocal) {
      videoContainer.classList.add('self');
      videoContainer.style.borderColor = 'var(--button-primary)';
      this.localVideoElement = videoContainer;
    }

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    video.srcObject = stream;

    // Стили для видео
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.transform = 'scaleX(-1)'; // Зеркальное отображение

    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    overlay.style.position = 'absolute';
    overlay.style.bottom = '10px';
    overlay.style.left = '10px';
    overlay.style.right = '10px';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'space-between';
    overlay.style.alignItems = 'center';
    overlay.style.color = 'white';
    overlay.style.textShadow = '0 1px 3px rgba(0,0,0,0.5)';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'participant-name';
    nameSpan.style.background = 'rgba(0,0,0,0.5)';
    nameSpan.style.padding = '4px 8px';
    nameSpan.style.borderRadius = '4px';
    nameSpan.style.fontSize = '12px';
    nameSpan.textContent = userName || (isLocal ? this.userName : `Участник ${peerId.slice(0, 4)}`);

    const audioIndicator = document.createElement('span');
    audioIndicator.className = 'audio-indicator';
    audioIndicator.style.background = 'rgba(0,0,0,0.5)';
    audioIndicator.style.padding = '4px';
    audioIndicator.style.borderRadius = '50%';
    audioIndicator.style.width = '24px';
    audioIndicator.style.height = '24px';
    audioIndicator.style.display = 'flex';
    audioIndicator.style.alignItems = 'center';
    audioIndicator.style.justifyContent = 'center';
    audioIndicator.innerHTML = '🔊';
    audioIndicator.id = `audio-${peerId}`;

    overlay.appendChild(nameSpan);
    overlay.appendChild(audioIndicator);
    videoContainer.appendChild(video);
    videoContainer.appendChild(overlay);

    // Добавляем в нужное место
    if (this.isTrainer) {
      // Для тренера - все в сетку
      document.getElementById('videoArea').appendChild(videoContainer);
    } else {
      // Для ученика
      if (isLocal) {
        // Свое видео добавляем в правую колонку
        const otherContainer = document.getElementById('otherParticipants');
        if (otherContainer) {
          // Свое видео делаем поменьше
          videoContainer.style.maxHeight = '150px';
          otherContainer.appendChild(videoContainer);
        }
      } else {
        // Проверяем, кто создатель комнаты (тренер)
        const isTrainerPeer = peerId === this.trainerId;

        if (isTrainerPeer) {
          // Видео тренера - большое слева
          const trainerContainer = document.getElementById('trainerVideo');
          if (trainerContainer) {
            trainerContainer.innerHTML = ''; // Очищаем
            trainerContainer.appendChild(videoContainer);
          }
        } else {
          // Остальные участники - в правую колонку
          const otherContainer = document.getElementById('otherParticipants');
          if (otherContainer) {
            videoContainer.style.maxHeight = '150px';
            otherContainer.appendChild(videoContainer);
          }
        }
      }
    }

    return video;
  },

  // Удалить видео участника
  removeVideoStream(peerId) {
    const videoElement = document.getElementById(`video-${peerId}`);
    if (videoElement) {
      videoElement.remove();
    }
  },

  // Обновить индикатор аудио
  updateAudioIndicator(peerId, isMuted) {
    const indicator = document.getElementById(`audio-${peerId}`);
    if (indicator) {
      indicator.innerHTML = isMuted ? '🔇' : '🔊';
      indicator.classList.toggle('muted', isMuted);
    }
  },

  // Обновить список участников в боковой панели
  updateParticipantsList() {
    const list = document.getElementById('participantsList');
    const count = document.getElementById('participantsCount');
    const panelCount = document.getElementById('panelParticipantsCount');

    list.innerHTML = '';
    count.textContent = this.participants.size;
    panelCount.textContent = `(${this.participants.size})`;

    this.participants.forEach((data, id) => {
      const item = document.createElement('li');
      item.className = 'participant-item';
      item.innerHTML = `
                <div class="participant-avatar">${data.name.charAt(0).toUpperCase()}</div>
                <div class="participant-info">
                    <div class="participant-name">${data.name} ${id === WebRTC.peerId ? '(вы)' : ''}</div>
                    <div class="participant-status">
                        <span>${data.video ? '🎥' : '🚫'}</span>
                        <span>${data.audio ? '🎤' : '🔇'}</span>
                        ${data.isSpeaker ? '<span>🗣️</span>' : ''}
                    </div>
                </div>
            `;
      list.appendChild(item);
    });
  },

  // Добавить участника
  addParticipant(peerId, name, isTrainer = false) {
    this.participants.set(peerId, {
      name: name || `Участник ${peerId.slice(0, 4)}`,
      audio: true,
      video: true,
      isSpeaker: false,
    });

    // Если это тренер, запоминаем его ID
    if (isTrainer) {
      this.trainerId = peerId;
    }

    this.updateParticipantsList();
  },

  // Обновить статус участника
  updateParticipantStatus(peerId, updates) {
    const participant = this.participants.get(peerId);
    if (participant) {
      Object.assign(participant, updates);
      this.updateParticipantsList();
    }
  },

  // Удалить участника
  removeParticipant(peerId) {
    this.participants.delete(peerId);
    this.updateParticipantsList();
  },

  // Копировать ID комнаты
  async copyRoomId() {
    const success = await Utils.copyToClipboard(this.roomId);
    if (success) {
      Utils.showToast('ID комнаты скопирован');
    }
  },

  // Переключить панель участников
  toggleParticipantsPanel() {
    document.getElementById('participantsPanel').classList.toggle('open');
  },

  // Таймер
  startTimer() {
    this.timerSeconds = 0;
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      document.getElementById('timer').textContent = Utils.formatTime(this.timerSeconds);
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  },

  // Модальные окна
  showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
  },

  hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
  },

  showExitConfirm() {
    document.getElementById('modalMessage').textContent =
      'Вы уверены, что хотите покинуть комнату?';
    this.showModal('confirmModal');
  },

  onExitConfirmed() {
    this.hideModal('confirmModal');
    WebRTC.hangup();
    this.stopTimer();
    this.showLandingPage();
  },

  showPermissionModal() {
    this.showModal('permissionModal');
  },

  onPermissionAllow() {
    this.hideModal('permissionModal');
    WebRTC.startCamera();
  },

  // Обработчики страницы входа
  onCreateRoom() {
    const name = document.getElementById('userName').value.trim();
    if (!name) {
      document.getElementById('userName').style.borderColor = 'var(--danger)';
      return;
    }

    this.userName = name;
    localStorage.setItem('userName', name);

    const roomId = Utils.generateRoomId();
    document.getElementById('roomIdInput').value = roomId;

    // Создаем комнату
    WebRTC.createRoom(roomId);
    this.showRoom(roomId, true); // true = тренер
  },

  onJoinRoom() {
    const name = document.getElementById('userName').value.trim();
    const roomId = document.getElementById('roomIdInput').value.trim();

    if (!name) {
      document.getElementById('userName').style.borderColor = 'var(--danger)';
      return;
    }

    if (!roomId) {
      document.getElementById('roomIdInput').style.borderColor = 'var(--danger)';
      return;
    }

    this.userName = name;
    localStorage.setItem('userName', name);

    // Присоединяемся к комнате
    WebRTC.joinRoom(roomId);
    this.showRoom(roomId, false); // false = ученик
  },

  // Заглушки для остальных функций
  showChat() {
    Utils.showToast('Чат будет доступен в следующей версии');
  },

  showSettings() {
    Utils.showToast('Настройки будут доступны в следующей версии');
  },

  startAIAnalysis() {
    Utils.showToast('🤖 ИИ-анализ запущен');
    // Здесь будет вызов ИИ-модуля
  },
};
