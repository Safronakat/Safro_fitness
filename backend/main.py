from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import uuid
import json
from typing import Dict, Set, Optional, List
from datetime import datetime
import asyncio
from pydantic import BaseModel

app = FastAPI(
    title="SkillSync API",
    description="API для сервиса видеотренировок с ИИ-анализом движений",
    version="1.0.0"
)

# Разрешаем CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============= МОДЕЛИ ДАННЫХ =============

class User(BaseModel):
    """Модель пользователя"""
    id: str
    name: str
    email: str
    role: str  # "trainer" или "student"
    created_at: str

class Training(BaseModel):
    """Модель тренировки"""
    id: str
    title: str
    trainer_id: str
    room_id: str
    start_time: str
    duration_minutes: int
    participants: List[str] = []
    status: str  # "scheduled", "active", "completed"

class Exercise(BaseModel):
    """Модель упражнения для анализа"""
    id: str
    name: str
    description: str
    target_points: List[str]  # ключевые точки для анализа
    ideal_angles: Dict[str, float]  # идеальные углы

class AnalysisResult(BaseModel):
    """Результат анализа движений"""
    id: str
    user_id: str
    training_id: str
    exercise_id: str
    timestamp: str
    angles: Dict[str, float]
    errors: List[str]
    score: float  # 0-100

# ============= ХРАНИЛИЩА ДАННЫХ (в памяти для демо) =============

# Для WebSocket соединений
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.rooms: Dict[str, Set[str]] = {}
        self.user_rooms: Dict[str, str] = {}  # user_id -> room_id

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        peer_id = str(uuid.uuid4())[:8]
        self.active_connections[peer_id] = websocket
        print(f"Client connected: {peer_id}")
        await websocket.send_json({"type": "connected", "peerId": peer_id})
        return peer_id

    def disconnect(self, peer_id: str):
        if peer_id in self.active_connections:
            del self.active_connections[peer_id]
        if peer_id in self.user_rooms:
            room_id = self.user_rooms[peer_id]
            if room_id in self.rooms:
                self.rooms[room_id].discard(peer_id)
            del self.user_rooms[peer_id]

    async def send_to_peer(self, peer_id: str, message: dict):
        if peer_id in self.active_connections:
            await self.active_connections[peer_id].send_json(message)

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_peer: str = None):
        if room_id in self.rooms:
            for peer_id in self.rooms[room_id]:
                if peer_id != exclude_peer:
                    await self.send_to_peer(peer_id, message)

    def join_room(self, peer_id: str, room_id: str) -> list:
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
        self.rooms[room_id].add(peer_id)
        self.user_rooms[peer_id] = room_id
        return list(self.rooms[room_id])

manager = ConnectionManager()

# Базы данных в памяти (для демо)
users_db: Dict[str, User] = {}
trainings_db: Dict[str, Training] = {}
results_db: List[AnalysisResult] = []

# Предопределенные упражнения
exercises_db = {
    "squat": Exercise(
        id="squat",
        name="Приседание",
        description="Классическое приседание с прямой спиной",
        target_points=["hip", "knee", "ankle"],
        ideal_angles={"knee": 90.0, "back": 45.0}
    ),
    "pushup": Exercise(
        id="pushup",
        name="Отжимание",
        description="Отжимание от пола с прямым корпусом",
        target_points=["shoulder", "elbow", "wrist"],
        ideal_angles={"elbow": 90.0, "back": 180.0}
    ),
    "plank": Exercise(
        id="plank",
        name="Планка",
        description="Удержание прямого корпуса",
        target_points=["shoulder", "hip", "ankle"],
        ideal_angles={"back": 180.0}
    )
}

# ============= API ЭНДПОИНТЫ =============

@app.get("/", tags=["Root"])
async def root():
    """Корневой эндпоинт - информация об API"""
    return {
        "message": "SkillSync API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": [
            "/users",
            "/trainings",
            "/exercises",
            "/analysis",
            "/ws - WebSocket для видеозвонков"
        ]
    }

# ============= ПОЛЬЗОВАТЕЛИ =============

@app.post("/users/register", tags=["Users"])
async def register_user(name: str, email: str, role: str = "student"):
    """Регистрация нового пользователя"""
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        name=name,
        email=email,
        role=role,
        created_at=datetime.now().isoformat()
    )
    users_db[user_id] = user
    return {"success": True, "user": user}

@app.get("/users", tags=["Users"])
async def get_users():
    """Получить всех пользователей"""
    return {"users": list(users_db.values())}

@app.get("/users/{user_id}", tags=["Users"])
async def get_user(user_id: str):
    """Получить пользователя по ID"""
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    return users_db[user_id]

# ============= ТРЕНИРОВКИ =============

@app.post("/trainings/create", tags=["Trainings"])
async def create_training(
    title: str,
    trainer_id: str,
    duration_minutes: int = 60
):
    """Создать новую тренировку"""
    training_id = str(uuid.uuid4())
    room_id = f"room-{uuid.uuid4().hex[:8]}"
    
    training = Training(
        id=training_id,
        title=title,
        trainer_id=trainer_id,
        room_id=room_id,
        start_time=datetime.now().isoformat(),
        duration_minutes=duration_minutes,
        status="scheduled"
    )
    trainings_db[training_id] = training
    return {
        "success": True,
        "training": training,
        "join_url": f"http://localhost:3000?room={room_id}"
    }

@app.get("/trainings", tags=["Trainings"])
async def get_trainings():
    """Получить все тренировки"""
    return {"trainings": list(trainings_db.values())}

@app.get("/trainings/{training_id}", tags=["Trainings"])
async def get_training(training_id: str):
    """Получить тренировку по ID"""
    if training_id not in trainings_db:
        raise HTTPException(status_code=404, detail="Training not found")
    return trainings_db[training_id]

@app.post("/trainings/{training_id}/join", tags=["Trainings"])
async def join_training(training_id: str, user_id: str):
    """Присоединиться к тренировке"""
    if training_id not in trainings_db:
        raise HTTPException(status_code=404, detail="Training not found")
    
    training = trainings_db[training_id]
    if user_id not in training.participants:
        training.participants.append(user_id)
    
    return {
        "success": True,
        "room_id": training.room_id,
        "participants": training.participants
    }

# ============= УПРАЖНЕНИЯ =============

@app.get("/exercises", tags=["Exercises"])
async def get_exercises():
    """Получить список доступных упражнений"""
    return {"exercises": list(exercises_db.values())}

@app.get("/exercises/{exercise_id}", tags=["Exercises"])
async def get_exercise(exercise_id: str):
    """Получить упражнение по ID"""
    if exercise_id not in exercises_db:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercises_db[exercise_id]

# ============= АНАЛИЗ ДВИЖЕНИЙ =============

class AnalysisRequest(BaseModel):
    user_id: str
    training_id: str
    exercise_id: str
    angles: Dict[str, float]

@app.post("/analysis/submit", tags=["Analysis"])
async def submit_analysis(request: AnalysisRequest):
    """Отправить результаты анализа движений"""
    # Получаем эталонные углы для упражнения
    exercise = exercises_db.get(request.exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    
    # Сравниваем с эталоном и находим ошибки
    errors = []
    total_diff = 0
    for point, ideal_angle in exercise.ideal_angles.items():
        if point in request.angles:
            diff = abs(request.angles[point] - ideal_angle)
            total_diff += diff
            if diff > 15:  # ошибка если отклонение больше 15 градусов
                errors.append(f"Угол в {point} отличается на {diff:.1f} градусов")
    
    # Вычисляем оценку (0-100)
    max_diff = len(exercise.ideal_angles) * 90  # макс возможное отклонение
    score = max(0, 100 - (total_diff / max_diff * 100))
    
    result = AnalysisResult(
        id=str(uuid.uuid4()),
        user_id=request.user_id,
        training_id=request.training_id,
        exercise_id=request.exercise_id,
        timestamp=datetime.now().isoformat(),
        angles=request.angles,
        errors=errors,
        score=round(score, 1)
    )
    
    results_db.append(result)
    return {
        "success": True,
        "result": result
    }

@app.get("/analysis/results/{user_id}", tags=["Analysis"])
async def get_user_results(user_id: str):
    """Получить все результаты анализа для пользователя"""
    user_results = [r for r in results_db if r.user_id == user_id]
    return {"results": user_results}

# ============= WEBRTC WEBSOCKET =============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    peer_id = await manager.connect(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            print(f"Message from {peer_id}: {message.get('type')}")
            
            if message["type"] == "join-room":
                room_id = message["roomId"]
                peers = manager.join_room(peer_id, room_id)
                
                await manager.send_to_peer(peer_id, {
                    "type": "joined-room",
                    "roomId": room_id,
                    "peers": peers
                })
                
                await manager.broadcast_to_room(room_id, {
                    "type": "peer-joined",
                    "peerId": peer_id,
                    "peers": peers
                }, exclude_peer=peer_id)
            
            elif message["type"] in ["offer", "answer", "ice-candidate"]:
                target_peer = message.get("targetPeerId")
                if target_peer:
                    await manager.send_to_peer(target_peer, {
                        **message,
                        "sourcePeerId": peer_id
                    })
            
    except WebSocketDisconnect:
        manager.disconnect(peer_id)

# ============= АДМИН ЭНДПОИНТЫ =============

@app.get("/admin/stats", tags=["Admin"])
async def get_stats():
    """Статистика сервера"""
    return {
        "active_connections": len(manager.active_connections),
        "active_rooms": len(manager.rooms),
        "total_users": len(users_db),
        "total_trainings": len(trainings_db),
        "total_analyses": len(results_db)
    }

@app.delete("/admin/reset", tags=["Admin"])
async def reset_data():
    """Сбросить все данные (для тестирования)"""
    users_db.clear()
    trainings_db.clear()
    results_db.clear()
    return {"message": "All data reset"}

# ============= ЗАПУСК =============

if __name__ == "__main__":
    import uvicorn
    print("🚀 SkillSync API запускается...")
    print("📚 Документация будет доступна по адресу: http://localhost:8080/docs")
    print("🔌 WebSocket эндпоинт: ws://localhost:8080/ws")
    uvicorn.run(app, host="0.0.0.0", port=8080)