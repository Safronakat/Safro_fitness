import cv2
import numpy as np
from pose_analyzer import PoseAnalyzer
from typing import Dict, List, Tuple

class SquatAnalyzer(PoseAnalyzer):
    """Анализатор правильности выполнения приседаний"""
    
    def __init__(self):
        super().__init__()
        
        # Эталонные значения для правильного приседания
        self.ideal_angles = {
            'knee': 90.0,  # угол в колене в нижней точке
            'hip': 45.0,    # угол в тазобедренном суставе
            'back': 45.0,   # угол наклона спины
            'ankle': 45.0   # угол в голеностопе
        }
        
        # Допустимые отклонения (в градусах)
        self.tolerance = 15.0
        
        # Индексы ключевых точек MediaPipe
        self.LANDMARKS = {
            'left_shoulder': 11,
            'right_shoulder': 12,
            'left_hip': 23,
            'right_hip': 24,
            'left_knee': 25,
            'right_knee': 26,
            'left_ankle': 27,
            'right_ankle': 28,
            'left_heel': 29,
            'right_heel': 30,
            'left_foot_index': 31,
            'right_foot_index': 32
        }
        
    def get_angles(self, landmarks) -> Dict[str, float]:
        """Получить все углы для анализа приседания"""
        angles = {}
        
        # Функция для получения координат точки
        def get_point(idx):
            return [landmarks.landmark[idx].x, landmarks.landmark[idx].y]
        
        try:
            # Правый угол в колене
            angles['right_knee'] = self.calculate_angle(
                get_point(self.LANDMARKS['right_hip']),
                get_point(self.LANDMARKS['right_knee']),
                get_point(self.LANDMARKS['right_ankle'])
            )
            
            # Левый угол в колене
            angles['left_knee'] = self.calculate_angle(
                get_point(self.LANDMARKS['left_hip']),
                get_point(self.LANDMARKS['left_knee']),
                get_point(self.LANDMARKS['left_ankle'])
            )
            
            # Угол в тазобедренном суставе (право)
            angles['right_hip'] = self.calculate_angle(
                get_point(self.LANDMARKS['right_shoulder']),
                get_point(self.LANDMARKS['right_hip']),
                get_point(self.LANDMARKS['right_knee'])
            )
            
            # Угол в тазобедренном суставе (лево)
            angles['left_hip'] = self.calculate_angle(
                get_point(self.LANDMARKS['left_shoulder']),
                get_point(self.LANDMARKS['left_hip']),
                get_point(self.LANDMARKS['left_knee'])
            )
            
            # Угол наклона спины (усреднённый)
            shoulder_mid = np.mean([
                get_point(self.LANDMARKS['left_shoulder']),
                get_point(self.LANDMARKS['right_shoulder'])
            ], axis=0)
            
            hip_mid = np.mean([
                get_point(self.LANDMARKS['left_hip']),
                get_point(self.LANDMARKS['right_hip'])
            ], axis=0)
            
            # Вектор спины и вертикаль
            angles['back'] = self.calculate_angle(
                [shoulder_mid[0], shoulder_mid[1] + 1],  # точка выше плеч
                shoulder_mid,
                hip_mid
            )
            
        except Exception as e:
            print(f"Ошибка вычисления углов: {e}")
            
        return angles
    
    def analyze_squat(self, angles: Dict[str, float]) -> List[str]:
        """Анализирует приседание и возвращает список ошибок"""
        errors = []
        
        if not angles:
            return ["Не удалось определить положение тела"]
        
        # Анализируем правую ногу
        if 'right_knee' in angles:
            knee_diff = abs(angles['right_knee'] - self.ideal_angles['knee'])
            if knee_diff > self.tolerance:
                if angles['right_knee'] > self.ideal_angles['knee'] + self.tolerance:
                    errors.append("⚠️ Недостаточно глубокий присед (правая нога)")
                elif angles['right_knee'] < self.ideal_angles['knee'] - self.tolerance:
                    errors.append("⚠️ Слишком глубокий присед (правая нога)")
        
        # Анализируем левую ногу
        if 'left_knee' in angles:
            knee_diff = abs(angles['left_knee'] - self.ideal_angles['knee'])
            if knee_diff > self.tolerance:
                if angles['left_knee'] > self.ideal_angles['knee'] + self.tolerance:
                    errors.append("⚠️ Недостаточно глубокий присед (левая нога)")
                elif angles['left_knee'] < self.ideal_angles['knee'] - self.tolerance:
                    errors.append("⚠️ Слишком глубокий присед (левая нога)")
        
        # Проверяем симметричность
        if 'right_knee' in angles and 'left_knee' in angles:
            knee_diff = abs(angles['right_knee'] - angles['left_knee'])
            if knee_diff > 10:
                errors.append("⚠️ Асимметрия в коленях (ноги на разной глубине)")
        
        # Проверяем наклон спины
        if 'back' in angles:
            back_diff = abs(angles['back'] - self.ideal_angles['back'])
            if back_diff > self.tolerance:
                if angles['back'] > self.ideal_angles['back'] + self.tolerance:
                    errors.append("⚠️ Слишком сильный наклон вперёд")
                elif angles['back'] < self.ideal_angles['back'] - self.tolerance:
                    errors.append("⚠️ Спина слишком прямая")
        
        return errors if errors else ["✅ Приседание выполняется правильно!"]
    
    def process_frame(self, frame):
        """Обрабатывает один кадр видео"""
        landmarks, annotated_frame = self.get_landmarks(frame)
        
        if not landmarks:
            return frame, ["👤 Человек не обнаружен"]
        
        angles = self.get_angles(landmarks)
        errors = self.analyze_squat(angles)
        
        # Добавляем информацию на кадр
        y_offset = 30
        for error in errors:
            cv2.putText(
                annotated_frame,
                error,
                (10, y_offset),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0) if "✅" in error else (0, 0, 255),
                2
            )
            y_offset += 30
        
        return annotated_frame, errors