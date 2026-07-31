import cv2
import mediapipe as mp
import numpy as np
from typing import Dict, List, Tuple, Optional

class PoseAnalyzer:
    """Базовый класс для анализа позы человека"""
    
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.mp_draw = mp.solutions.drawing_utils
        
    def get_landmarks(self, image):
        """Получить ключевые точки из изображения"""
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = self.pose.process(image_rgb)
        
        if not results.pose_landmarks:
            return None, image
            
        # Рисуем скелет для визуализации
        self.mp_draw.draw_landmarks(
            image, 
            results.pose_landmarks, 
            self.mp_pose.POSE_CONNECTIONS
        )
        
        return results.pose_landmarks, image
    
    def calculate_angle(self, a: List[float], b: List[float], c: List[float]) -> float:
        """Вычислить угол между тремя точками"""
        a = np.array(a)
        b = np.array(b)
        c = np.array(c)
        
        ba = a - b
        bc = c - b
        
        cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
        angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
        
        return np.degrees(angle)