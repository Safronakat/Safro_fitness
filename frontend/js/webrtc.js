// WebRTC - управление видеозвонками
const WebRTC = {
  // Состояние
  socket: null,
  peerId: null,
  currentRoom: null,
  localStream: null,
  peerConnections: {},
  pendingCandidates: {},
  processingOffers: {},
  isCameraOn: false,
  isMicOn: false,
  isScreenSharing: false,
  userName: '',
  hasJoinedRoom: false, // Флаг, что уже присоединились к комнате

  // Конфигурация ICE серверов
  configuration: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    iceCandidatePoolSize: 10,
  },

  // Подключение к сигнальному серверу
  connect() {
    this.socket = new WebSocket('ws://localhost:8080/ws');

    this.socket.onopen = () => {
      console.log('✅ WebRTC: Подключено к серверу');
    };

    this.socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      await this.handleMessage(message);
    };

    this.socket.onerror = (error) => {
      console.error('❌ WebRTC: Ошибка WebSocket:', error);
    };
  },

  // Обработка сообщений от сервера
  async handleMessage(message) {
    console.log('📨 WebRTC: Получено:', message.type, message.sourcePeerId || '');

    switch (message.type) {
      case 'connected':
        this.peerId = message.peerId;
        console.log('🆔 WebRTC: Мой ID:', this.peerId);
        break;

      case 'joined-room':
        this.currentRoom = message.roomId;
        this.hasJoinedRoom = true;

        // Первый участник в комнате - тренер
        const isTrainer = message.peers.length === 1;
        UI.addParticipant(this.peerId, this.userName, isTrainer);

        // Добавляем существующих участников
        for (const otherPeerId of message.peers) {
          if (otherPeerId !== this.peerId) {
            UI.addParticipant(otherPeerId, `Участник ${otherPeerId.slice(0, 4)}`, false);
            // Создаем соединение КАК ТОЛЬКО получаем список участников
            await this.createPeerConnection(otherPeerId, true);
          }
        }
        break;

      case 'peer-joined':
        console.log('👤 WebRTC: Новый участник:', message.peerId);
        // Используем имя из сообщения, если оно есть
        const userName = message.userName || `Участник ${message.peerId.slice(0, 4)}`;
        UI.addParticipant(message.peerId, userName, false);
        await this.createPeerConnection(message.peerId, true);
        break;

      case 'peer-left':
        console.log('👤 WebRTC: Участник ушел:', message.peerId);
        this.removePeerConnection(message.peerId);
        UI.removeParticipant(message.peerId); // Это уже есть
        UI.removeVideoStream(message.peerId); // Это уже есть
        break;

      case 'offer':
        await this.handleOffer(message);
        break;

      case 'answer':
        await this.handleAnswer(message);
        break;
      case 'mic-state':
        console.log(
          '🎤 Смена состояния микрофона у',
          message.sourcePeerId,
          'muted:',
          message.isMuted,
        );
        UI.updateParticipantStatus(message.sourcePeerId, { audio: !message.isMuted });
        UI.updateAudioIndicator(message.sourcePeerId, message.isMuted);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(message);
        break;
    }
  },

  // Создание комнаты
  createRoom(roomId) {
    this.userName = UI.userName;
    this.socket.send(
      JSON.stringify({
        type: 'join-room',
        roomId: roomId,
      }),
    );
  },

  // Присоединение к комнате
  joinRoom(roomId) {
    this.userName = UI.userName;
    this.socket.send(
      JSON.stringify({
        type: 'join-room',
        roomId: roomId,
      }),
    );
  },

  // Создание peer connection
  async createPeerConnection(targetPeerId, isCaller = false) {
    if (this.peerConnections[targetPeerId]) {
      console.log('Соединение уже существует с', targetPeerId);
      return this.peerConnections[targetPeerId];
    }

    console.log(`🔌 WebRTC: Создаем соединение с ${targetPeerId}, isCaller: ${isCaller}`);

    const pc = new RTCPeerConnection(this.configuration);
    this.peerConnections[targetPeerId] = pc;

    if (!this.pendingCandidates[targetPeerId]) {
      this.pendingCandidates[targetPeerId] = [];
    }

    // Добавляем локальные треки, если камера уже включена
    if (this.localStream && this.isCameraOn) {
      console.log('📹 Добавляем локальные треки в соединение с', targetPeerId);
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
        console.log('  - Добавлен трек:', track.kind);
      });
    }

    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`❄️ Отправляем ICE кандидат для ${targetPeerId}`);
        this.socket.send(
          JSON.stringify({
            type: 'ice-candidate',
            targetPeerId: targetPeerId,
            candidate: event.candidate,
          }),
        );
      }
    };

    // Получение удаленного потока
    pc.ontrack = (event) => {
      console.log(`📹 ПОЛУЧЕН ТРЕК от ${targetPeerId}:`, event.track.kind);
      const stream = event.streams[0];

      // Добавляем видео в UI
      const existingVideo = document.getElementById(`video-${targetPeerId}`);
      if (!existingVideo) {
        UI.addVideoStream(targetPeerId, stream, false, `Участник ${targetPeerId.slice(0, 4)}`);
      } else {
        console.log('⚠️ Видео уже существует для', targetPeerId);
      }
    };

    // Обработка состояния ICE
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE состояние с ${targetPeerId}:`, pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log(`📊 Состояние соединения с ${targetPeerId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('✅ СОЕДИНЕНИЕ УСТАНОВЛЕНО с', targetPeerId);
      }
    };

    // Если мы инициатор - создаем offer
    if (isCaller && this.localStream && this.isCameraOn) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);

        this.socket.send(
          JSON.stringify({
            type: 'offer',
            targetPeerId: targetPeerId,
            sdp: pc.localDescription,
            userName: this.userName, // ← ДОБАВИТЬ ЭТУ СТРОКУ
          }),
        );
      } catch (error) {
        console.error('❌ Ошибка создания offer:', error);
      }
    }
    // Сохраняем имя участника, если оно пришло
    if (message.userName) {
      UI.updateParticipantStatus(sourcePeerId, { name: message.userName });
    }
    return pc;
  },

  // Обработка offer
  async handleOffer(message) {
    const sourcePeerId = message.sourcePeerId;
    console.log('📥 ПОЛУЧЕН OFFER от', sourcePeerId);

    // Предотвращаем двойную обработку
    if (this.processingOffers[sourcePeerId]) {
      console.log('⏳ Уже обрабатываем offer от', sourcePeerId);
      return;
    }
    this.processingOffers[sourcePeerId] = true;

    try {
      let pc = this.peerConnections[sourcePeerId];
      if (!pc) {
        pc = await this.createPeerConnection(sourcePeerId, false);
      }

      // Проверяем состояние перед установкой remote description
      if (pc.signalingState !== 'stable') {
        console.log('⏳ Текущее signaling state:', pc.signalingState, 'ждем...');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
      console.log('✅ Remote description установлен для', sourcePeerId);

      // Применяем отложенные кандидаты
      if (this.pendingCandidates[sourcePeerId]?.length) {
        console.log(
          '📦 Применяем отложенные кандидаты:',
          this.pendingCandidates[sourcePeerId].length,
        );
        for (const candidate of this.pendingCandidates[sourcePeerId]) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Ошибка добавления кандидата:', e);
          }
        }
        this.pendingCandidates[sourcePeerId] = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.send(
        JSON.stringify({
          type: 'answer',
          targetPeerId: sourcePeerId,
          sdp: pc.localDescription,
        }),
      );
      console.log('📤 Отправлен answer для', sourcePeerId);
    } catch (error) {
      console.error('❌ Ошибка обработки offer:', error);
    } finally {
      this.processingOffers[sourcePeerId] = false;
    }
  },

  // Обработка answer
  async handleAnswer(message) {
    const sourcePeerId = message.sourcePeerId;
    console.log('📥 ПОЛУЧЕН ANSWER от', sourcePeerId);

    const pc = this.peerConnections[sourcePeerId];
    if (!pc) {
      console.log('⚠️ Нет соединения для answer от', sourcePeerId);
      return;
    }

    try {
      // Проверяем, что мы в правильном состоянии
      if (pc.signalingState !== 'have-local-offer') {
        console.log('⚠️ Неправильное состояние для answer:', pc.signalingState);
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
      console.log('✅ Remote description установлен для', sourcePeerId);

      // Применяем отложенные кандидаты
      if (this.pendingCandidates[sourcePeerId]?.length) {
        console.log(
          '📦 Применяем отложенные кандидаты:',
          this.pendingCandidates[sourcePeerId].length,
        );
        for (const candidate of this.pendingCandidates[sourcePeerId]) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Ошибка добавления кандидата:', e);
          }
        }
        this.pendingCandidates[sourcePeerId] = [];
      }
    } catch (error) {
      console.error('❌ Ошибка обработки answer:', error);
    }
  },

  // Обработка ICE candidate
  async handleIceCandidate(message) {
    const sourcePeerId = message.sourcePeerId;
    const pc = this.peerConnections[sourcePeerId];

    if (!pc) {
      console.log('⚠️ Получен кандидат для неизвестного пира:', sourcePeerId);
      return;
    }

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        console.log('❄️ Добавлен ICE кандидат для', sourcePeerId);
      } catch (error) {
        console.error('Ошибка добавления кандидата:', error);
      }
    } else {
      console.log('⏳ Сохраняем кандидат для', sourcePeerId, '(нет remote description)');
      if (!this.pendingCandidates[sourcePeerId]) {
        this.pendingCandidates[sourcePeerId] = [];
      }
      this.pendingCandidates[sourcePeerId].push(message.candidate);
    }
  },

  // Запуск камеры
  async startCamera() {
    try {
      console.log('📷 Запрашиваем доступ к камере...');

      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      this.isCameraOn = true;
      this.isMicOn = true;

      // Показываем локальное видео
      UI.addVideoStream('local', this.localStream, true, UI.userName);

      // Обновляем UI
      document.getElementById('toggleMic').classList.remove('muted');
      document.getElementById('toggleCam').classList.remove('muted');

      console.log('✅ WebRTC: Камера включена');

      // Если мы уже в комнате, нужно добавить треки во все существующие соединения
      if (this.hasJoinedRoom) {
        console.log('🔄 Добавляем треки в существующие соединения');
        Object.keys(this.peerConnections).forEach((peerId) => {
          const pc = this.peerConnections[peerId];
          this.localStream.getTracks().forEach((track) => {
            pc.addTrack(track, this.localStream);
          });

          // Если мы уже создавали offer, но он не отправился из-за отсутствия треков
          if (pc.signalingState === 'stable') {
            this.createOfferForPeer(peerId);
          }
        });
      }
    } catch (error) {
      console.error('❌ WebRTC: Ошибка доступа к камере:', error);
      UI.showPermissionModal();
    }
  },

  // Создать offer для конкретного пира
  async createOfferForPeer(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc || !this.localStream || !this.isCameraOn) return;

    try {
      console.log('📤 СОЗДАЕМ OFFER для', peerId);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      this.socket.send(
        JSON.stringify({
          type: 'offer',
          targetPeerId: peerId,
          sdp: pc.localDescription,
        }),
      );
    } catch (error) {
      console.error('❌ Ошибка создания offer:', error);
    }
  },
  // Переключение микрофона
  toggleMic() {
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isMicOn = audioTrack.enabled;

      const micBtn = document.getElementById('toggleMic');
      if (this.isMicOn) {
        micBtn.classList.remove('muted');
      } else {
        micBtn.classList.add('muted');
      }

      UI.updateAudioIndicator('local', !this.isMicOn);

      // Отправляем всем участникам информацию о состоянии микрофона
      if (this.socket && this.currentRoom) {
        this.socket.send(
          JSON.stringify({
            type: 'mic-state',
            roomId: this.currentRoom,
            targetPeerId: 'all',
            isMuted: !this.isMicOn,
          }),
        );
      }
    }
  },

  // Переключение камеры
  toggleCam() {
    if (!this.localStream) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.isCameraOn = videoTrack.enabled;

      const camBtn = document.getElementById('toggleCam');
      if (this.isCameraOn) {
        camBtn.classList.remove('muted');
      } else {
        camBtn.classList.add('muted');
      }

      // Показываем черный экран вместо полного исчезновения
      const localVideo = document.getElementById('video-local');
      if (localVideo) {
        const videoElement = localVideo.querySelector('video');
        if (videoElement) {
          if (this.isCameraOn) {
            videoElement.style.display = 'block';
            videoElement.srcObject = this.localStream;
          } else {
            // Оставляем видео элемент, но показываем черный экран
            videoElement.style.display = 'block';
            // Можно добавить черный overlay или просто видео без потока
            videoElement.srcObject = null;
            // Добавляем класс для черного фона
            localVideo.style.background = '#000';
          }
        }
      }
    }
  },

  // Демонстрация экрана
  async shareScreen() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      // Заменяем видео трек на трек экрана
      const videoTrack = screenStream.getVideoTracks()[0];

      Object.values(this.peerConnections).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      this.isScreenSharing = true;
      document.getElementById('shareScreen').classList.add('active');

      // Когда пользователь останавливает демонстрацию
      videoTrack.onended = () => {
        this.stopScreenSharing();
      };
    } catch (error) {
      console.error('❌ WebRTC: Ошибка демонстрации экрана:', error);
    }
  },

  // Остановка демонстрации экрана
  stopScreenSharing() {
    if (this.isScreenSharing && this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];

      Object.values(this.peerConnections).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      this.isScreenSharing = false;
      document.getElementById('shareScreen').classList.remove('active');
    }
  },

  // Удалить участника
  removeParticipant(peerId) {
    this.participants.delete(peerId);
    this.updateParticipantsList();

    // Если это был тренер, сбрасываем trainerId
    if (peerId === this.trainerId) {
      this.trainerId = null;
    }
  },
  // Завершение звонка
  hangup() {
    // Закрываем все соединения
    Object.keys(this.peerConnections).forEach((peerId) => {
      this.removePeerConnection(peerId); // ← Здесь this.removePeerConnection существует
    });

    // Останавливаем локальный поток
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Очищаем состояние
    this.peerConnections = {};
    this.pendingCandidates = {};
    this.processingOffers = {};
    this.isCameraOn = false;
    this.isMicOn = false;
    this.isScreenSharing = false;
    this.currentRoom = null;
    this.hasJoinedRoom = false;

    // Очищаем UI
    document.getElementById('videoArea').innerHTML = '';

    console.log('👋 WebRTC: Звонок завершен');
  },
};
