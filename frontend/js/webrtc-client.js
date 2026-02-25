// Состояние
let socket;
let peerId = null;
let currentRoom = null;
let localStream = null;
let peerConnections = {};
let videoElements = {};
let pendingCandidates = {};
let isCameraOn = false;
let isMicOn = false;
let processingOffers = {}; // Для предотвращения двойной обработки

const configuration = {
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
};

// DOM элементы
const startCameraBtn = document.getElementById('startCamera');
const stopCameraBtn = document.getElementById('stopCamera');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const hangupBtn = document.getElementById('hangup');
const roomIdInput = document.getElementById('roomId');
const roomInfo = document.getElementById('roomInfo');
const currentRoomSpan = document.getElementById('currentRoom');
const participantCount = document.getElementById('participantCount');
const myPeerIdSpan = document.getElementById('myPeerId');
const videoContainer = document.getElementById('videoContainer');

// Подключение к сигнальному серверу
function connect() {
  socket = new WebSocket('ws://localhost:8080/ws');

  socket.onopen = () => {
    console.log('✅ Подключено к серверу');
  };

  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    console.log('📨 Получено:', message.type, 'от:', message.sourcePeerId);

    switch (message.type) {
      case 'connected':
        peerId = message.peerId;
        myPeerIdSpan.textContent = peerId;
        console.log('🆔 Мой ID:', peerId);
        break;

      case 'joined-room':
        currentRoom = message.roomId;
        currentRoomSpan.textContent = currentRoom;
        roomInfo.style.display = 'block';
        participantCount.textContent = message.peers.length;

        // Создаем соединения с другими участниками
        for (const otherPeerId of message.peers) {
          if (otherPeerId !== peerId) {
            await createPeerConnection(otherPeerId, true);
          }
        }
        break;

      case 'peer-joined':
        console.log('👤 Новый участник:', message.peerId);
        participantCount.textContent = message.peers.length;
        await createPeerConnection(message.peerId, true);
        break;

      case 'peer-left':
        console.log('👤 Участник ушел:', message.peerId);
        removePeerConnection(message.peerId);
        participantCount.textContent = message.peers.length;
        break;

      case 'offer':
        await handleOffer(message);
        break;

      case 'answer':
        await handleAnswer(message);
        break;

      case 'ice-candidate':
        await handleIceCandidate(message);
        break;
    }
  };

  socket.onerror = (error) => {
    console.error('❌ Ошибка WebSocket:', error);
  };
}

// Создание peer connection
async function createPeerConnection(targetPeerId, isCaller = false) {
  if (peerConnections[targetPeerId]) {
    console.log('Соединение уже существует с', targetPeerId);
    return peerConnections[targetPeerId];
  }

  console.log(`🔌 СОЗДАЕМ СОЕДИНЕНИЕ с ${targetPeerId}, isCaller: ${isCaller}`);

  const pc = new RTCPeerConnection(configuration);
  peerConnections[targetPeerId] = pc;

  if (!pendingCandidates[targetPeerId]) {
    pendingCandidates[targetPeerId] = [];
  }

  // Добавляем локальные треки
  if (localStream && isCameraOn) {
    console.log('📹 Добавляем локальные треки в соединение с', targetPeerId);
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
      console.log('  - Добавлен трек:', track.kind);
    });
  }

  // Обработка ICE кандидатов
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log(
        `❄️ КАНДИДАТ для ${targetPeerId}:`,
        event.candidate.type,
        event.candidate.address,
      );
      socket.send(
        JSON.stringify({
          type: 'ice-candidate',
          targetPeerId: targetPeerId,
          candidate: event.candidate,
        }),
      );
    }
  };

  pc.onicecandidateerror = (event) => {
    console.error('❌ Ошибка ICE кандидата:', event);
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`🧊 ICE состояние с ${targetPeerId}:`, pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected') {
      console.log('✅ ICE соединение установлено для', targetPeerId);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`📊 Состояние соединения с ${targetPeerId}:`, pc.connectionState);
    if (pc.connectionState === 'connected') {
      console.log('✅ ПОЛНОЕ СОЕДИНЕНИЕ установлено с', targetPeerId);
    }
    if (pc.connectionState === 'failed') {
      console.error('❌ СОЕДИНЕНИЕ ПРОВАЛИЛОСЬ с', targetPeerId);
      // Пробуем переподключиться
      setTimeout(() => {
        if (peerConnections[targetPeerId]) {
          console.log('🔄 Пытаемся переподключиться к', targetPeerId);
          delete peerConnections[targetPeerId];
          createPeerConnection(targetPeerId, true);
        }
      }, 2000);
    }
  };

  // Получение удаленного потока
  pc.ontrack = (event) => {
    console.log(`📹 ПОЛУЧЕН ТРЕК от ${targetPeerId}:`, event.track.kind);
    const remoteStream = event.streams[0];

    let videoElement = videoElements[targetPeerId];
    if (!videoElement) {
      videoElement = createVideoElement(targetPeerId, false);
      videoElements[targetPeerId] = videoElement;
    }

    videoElement.srcObject = remoteStream;
  };

  // Если мы инициатор - создаем offer
  if (isCaller && localStream && isCameraOn) {
    try {
      console.log('📤 СОЗДАЕМ OFFER для', targetPeerId);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      socket.send(
        JSON.stringify({
          type: 'offer',
          targetPeerId: targetPeerId,
          sdp: pc.localDescription,
        }),
      );
      console.log('📤 Отправлен offer для', targetPeerId);
    } catch (error) {
      console.error('❌ Ошибка создания offer:', error);
    }
  }

  return pc;
}

// Обработка offer
async function handleOffer(message) {
  const sourcePeerId = message.sourcePeerId;
  console.log('📥 ПОЛУЧЕН OFFER от', sourcePeerId);

  // Предотвращаем двойную обработку
  if (processingOffers[sourcePeerId]) {
    console.log('⏳ Уже обрабатываем offer от', sourcePeerId);
    return;
  }
  processingOffers[sourcePeerId] = true;

  try {
    let pc = peerConnections[sourcePeerId];
    if (!pc) {
      pc = await createPeerConnection(sourcePeerId, false);
    }

    // Проверяем состояние перед установкой remote description
    if (pc.signalingState !== 'stable') {
      console.log('⏳ Текущее signaling state:', pc.signalingState, 'ждем...');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    console.log('✅ Remote description установлен для', sourcePeerId);

    // Применяем отложенные кандидаты
    if (pendingCandidates[sourcePeerId] && pendingCandidates[sourcePeerId].length > 0) {
      console.log('📦 Применяем отложенные кандидаты:', pendingCandidates[sourcePeerId].length);
      for (const candidate of pendingCandidates[sourcePeerId]) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Ошибка добавления кандидата:', e);
        }
      }
      pendingCandidates[sourcePeerId] = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.send(
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
    processingOffers[sourcePeerId] = false;
  }
}

// Обработка answer
async function handleAnswer(message) {
  const sourcePeerId = message.sourcePeerId;
  console.log('📥 ПОЛУЧЕН ANSWER от', sourcePeerId);

  const pc = peerConnections[sourcePeerId];
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
    if (pendingCandidates[sourcePeerId] && pendingCandidates[sourcePeerId].length > 0) {
      console.log('📦 Применяем отложенные кандидаты:', pendingCandidates[sourcePeerId].length);
      for (const candidate of pendingCandidates[sourcePeerId]) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Ошибка добавления кандидата:', e);
        }
      }
      pendingCandidates[sourcePeerId] = [];
    }
  } catch (error) {
    console.error('❌ Ошибка обработки answer:', error);
  }
}

// Обработка ICE candidate
async function handleIceCandidate(message) {
  const sourcePeerId = message.sourcePeerId;
  const pc = peerConnections[sourcePeerId];

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
    if (!pendingCandidates[sourcePeerId]) {
      pendingCandidates[sourcePeerId] = [];
    }
    pendingCandidates[sourcePeerId].push(message.candidate);
  }
}

// Удаление соединения
function removePeerConnection(peerId) {
  if (peerConnections[peerId]) {
    peerConnections[peerId].close();
    delete peerConnections[peerId];
  }
  if (pendingCandidates[peerId]) {
    delete pendingCandidates[peerId];
  }
  if (videoElements[peerId]) {
    videoElements[peerId].remove();
    delete videoElements[peerId];
  }
}

// Создание видео элемента
function createVideoElement(id, isLocal = false) {
  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-${id}`;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;

  if (isLocal) {
    video.muted = true;
  }

  const label = document.createElement('div');
  label.className = 'video-label';
  label.textContent = isLocal ? 'Вы' : `Участник ${id.slice(0, 4)}`;

  container.appendChild(video);
  container.appendChild(label);
  videoContainer.appendChild(container);

  return video;
}

// Запуск камеры
async function startCamera() {
  try {
    console.log('📷 Запрашиваем доступ к камере...');

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    isCameraOn = true;
    isMicOn = true;

    console.log('✅ Камера включена');

    // Показываем локальное видео
    const localVideo = createVideoElement('local', true);
    localVideo.srcObject = localStream;

    startCameraBtn.disabled = true;
    if (stopCameraBtn) stopCameraBtn.disabled = false;
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
  } catch (error) {
    console.error('❌ Ошибка доступа к камере:', error);
    alert('Не удалось получить доступ к камере/микрофону');
  }
}

// Выключение камеры
function stopCamera() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());

    const localVideo = document.getElementById('video-local');
    if (localVideo) localVideo.remove();

    // Уведомляем всех пиров
    Object.keys(peerConnections).forEach((peerId) => {
      const pc = peerConnections[peerId];
      const senders = pc.getSenders();
      senders.forEach((sender) => pc.removeTrack(sender));
    });

    localStream = null;
    isCameraOn = false;
    isMicOn = false;

    startCameraBtn.disabled = false;
    if (stopCameraBtn) stopCameraBtn.disabled = true;

    console.log('📷 Камера выключена');
  }
}

// Создание комнаты
function createRoom() {
  const roomId = 'room-' + Math.random().toString(36).substring(7);
  roomIdInput.value = roomId;
  joinRoom();
}

// Присоединение к комнате
function joinRoom() {
  const roomId = roomIdInput.value.trim();
  if (!roomId) {
    alert('Введите ID комнаты');
    return;
  }

  if (!localStream) {
    alert('Сначала включите камеру');
    return;
  }

  socket.send(
    JSON.stringify({
      type: 'join-room',
      roomId: roomId,
    }),
  );

  createRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
  hangupBtn.disabled = false;
}

// Завершение звонка
function hangup() {
  Object.keys(peerConnections).forEach((peerId) => {
    removePeerConnection(peerId);
  });

  while (videoContainer.children.length > 1) {
    videoContainer.removeChild(videoContainer.lastChild);
  }

  peerConnections = {};
  videoElements = {};
  pendingCandidates = {};
  processingOffers = {};

  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = false;
  hangupBtn.disabled = true;
  roomInfo.style.display = 'none';
  currentRoom = null;
}

// Диагностика
function diagnoseConnection() {
  console.log('=== ДИАГНОСТИКА СОЕДИНЕНИЯ ===');
  console.log('Peer ID:', peerId);
  console.log('Комната:', currentRoom);
  console.log('Камера включена:', isCameraOn);
  console.log('Локальный поток есть:', !!localStream);
  console.log('Активные соединения:', Object.keys(peerConnections).length);

  Object.entries(peerConnections).forEach(([id, pc]) => {
    console.log(`\nСоединение с ${id}:`);
    console.log('  Состояние:', pc.connectionState);
    console.log('  ICE состояние:', pc.iceConnectionState);
    console.log('  Сигнальное состояние:', pc.signalingState);
    console.log('  Локальное описание:', pc.localDescription ? 'есть' : 'нет');
    console.log('  Удаленное описание:', pc.remoteDescription ? 'есть' : 'нет');

    const senders = pc.getSenders();
    console.log('  Отправители:', senders.length);
    senders.forEach((s) => console.log('    -', s.track ? s.track.kind : 'без трека'));
  });
}

// Запускаем диагностику каждые 5 секунд
setInterval(diagnoseConnection, 5000);

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  startCameraBtn.addEventListener('click', startCamera);
  if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);
  createRoomBtn.addEventListener('click', createRoom);
  joinRoomBtn.addEventListener('click', joinRoom);
  hangupBtn.addEventListener('click', hangup);

  connect();
});
