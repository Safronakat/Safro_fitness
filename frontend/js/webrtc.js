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
    console.log('📨 WebRTC: Получено:', message.type);

    switch (message.type) {
      case 'connected':
        this.peerId = message.peerId;
        console.log('🆔 WebRTC: Мой ID:', this.peerId);
        break;

      case 'joined-room':
        this.currentRoom = message.roomId;

        // Первый участник в комнате - тренер
        const isTrainer = message.peers.length === 1;
        UI.addParticipant(this.peerId, this.userName, isTrainer);

        // Создаем соединения с другими участниками
        for (const otherPeerId of message.peers) {
          if (otherPeerId !== this.peerId) {
            await this.createPeerConnection(otherPeerId, true);
            UI.addParticipant(otherPeerId, `Участник ${otherPeerId.slice(0, 4)}`, false);
          }
        }
        break;

      case 'peer-joined':
        console.log('👤 WebRTC: Новый участник:', message.peerId);
        await this.createPeerConnection(message.peerId, true);
        // Новый участник никогда не может быть тренером (тренер уже есть)
        UI.addParticipant(message.peerId, `Участник ${message.peerId.slice(0, 4)}`, false);
        break;

      case 'peer-left':
        console.log('👤 WebRTC: Участник ушел:', message.peerId);
        this.removePeerConnection(message.peerId);
        UI.removeParticipant(message.peerId);
        UI.removeVideoStream(message.peerId);
        break;

      case 'offer':
        await this.handleOffer(message);
        break;

      case 'answer':
        await this.handleAnswer(message);
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
      return this.peerConnections[targetPeerId];
    }

    console.log(`🔌 WebRTC: Создаем соединение с ${targetPeerId}`);

    const pc = new RTCPeerConnection(this.configuration);
    this.peerConnections[targetPeerId] = pc;

    if (!this.pendingCandidates[targetPeerId]) {
      this.pendingCandidates[targetPeerId] = [];
    }

    // Добавляем локальные треки
    if (this.localStream && this.isCameraOn) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
      if (event.candidate) {
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
      console.log(`📹 WebRTC: Получен трек от ${targetPeerId}`);
      const stream = event.streams[0];
      UI.addVideoStream(targetPeerId, stream, false, `Участник ${targetPeerId.slice(0, 4)}`);
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
          }),
        );
      } catch (error) {
        console.error('❌ WebRTC: Ошибка создания offer:', error);
      }
    }

    return pc;
  },

  // Обработка offer
  async handleOffer(message) {
    const sourcePeerId = message.sourcePeerId;

    if (this.processingOffers[sourcePeerId]) return;
    this.processingOffers[sourcePeerId] = true;

    try {
      let pc = this.peerConnections[sourcePeerId];
      if (!pc) {
        pc = await this.createPeerConnection(sourcePeerId, false);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));

      // Применяем отложенные кандидаты
      if (this.pendingCandidates[sourcePeerId]?.length) {
        for (const candidate of this.pendingCandidates[sourcePeerId]) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {}
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
    } catch (error) {
      console.error('❌ WebRTC: Ошибка обработки offer:', error);
    } finally {
      this.processingOffers[sourcePeerId] = false;
    }
  },

  // Обработка answer
  async handleAnswer(message) {
    const sourcePeerId = message.sourcePeerId;
    const pc = this.peerConnections[sourcePeerId];

    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));

      if (this.pendingCandidates[sourcePeerId]?.length) {
        for (const candidate of this.pendingCandidates[sourcePeerId]) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {}
        }
        this.pendingCandidates[sourcePeerId] = [];
      }
    } catch (error) {
      console.error('❌ WebRTC: Ошибка обработки answer:', error);
    }
  },

  // Обработка ICE candidate
  async handleIceCandidate(message) {
    const sourcePeerId = message.sourcePeerId;
    const pc = this.peerConnections[sourcePeerId];

    if (!pc) return;

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (error) {
        console.error('❌ WebRTC: Ошибка добавления кандидата:', error);
      }
    } else {
      if (!this.pendingCandidates[sourcePeerId]) {
        this.pendingCandidates[sourcePeerId] = [];
      }
      this.pendingCandidates[sourcePeerId].push(message.candidate);
    }
  },

  // Запуск камеры
  async startCamera() {
    try {
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
    } catch (error) {
      console.error('❌ WebRTC: Ошибка доступа к камере:', error);
      UI.showPermissionModal();
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
      micBtn.classList.toggle('muted', !this.isMicOn);

      UI.updateAudioIndicator('local', !this.isMicOn);
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
      camBtn.classList.toggle('muted', !this.isCameraOn);

      // Показываем/скрываем видео или показываем аватар
      const localVideo = document.getElementById('video-local');
      if (localVideo) {
        if (this.isCameraOn) {
          localVideo.style.display = 'block';
        } else {
          localVideo.style.display = 'none';
          // Показать аватар
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
      const sender = this.peerConnections[Object.keys(this.peerConnections)[0]]
        .getSenders()
        .find((s) => s.track.kind === 'video');

      if (sender) {
        sender.replaceTrack(videoTrack);
      }

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
      const sender = this.peerConnections[Object.keys(this.peerConnections)[0]]
        .getSenders()
        .find((s) => s.track.kind === 'video');

      if (sender) {
        sender.replaceTrack(videoTrack);
      }

      this.isScreenSharing = false;
      document.getElementById('shareScreen').classList.remove('active');
    }
  },

  // Удаление соединения
  removePeerConnection(peerId) {
    if (this.peerConnections[peerId]) {
      this.peerConnections[peerId].close();
      delete this.peerConnections[peerId];
    }
    if (this.pendingCandidates[peerId]) {
      delete this.pendingCandidates[peerId];
    }
  },

  // Завершение звонка
  hangup() {
    // Закрываем все соединения
    Object.keys(this.peerConnections).forEach((peerId) => {
      this.removePeerConnection(peerId);
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

    // Очищаем UI
    document.getElementById('videoArea').innerHTML = '';

    console.log('👋 WebRTC: Звонок завершен');
  },
};
