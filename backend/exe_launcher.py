import subprocess
import os
import signal
import sys

class ExeLauncher:
    def __init__(self):
        self.process = None
        self.exe_path = r"C:\Users\Пользователь\Safro_fitness\Safro_fitness\MediaPipe Pose VR\mediapipepose\mediapipepose.exe"
    
    def start(self):
        if self.process and self.process.poll() is None:
            return {"status": "already_running", "message": "MediaPipe Pose уже запущен"}
        
        try:
            if os.path.exists(self.exe_path):
                # Запускаем EXE скрыто
                self.process = subprocess.Popen(
                    self.exe_path,
                    shell=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
                )
                return {"status": "started", "message": "MediaPipe Pose запущен"}
            else:
                return {"status": "error", "message": f"Файл не найден: {self.exe_path}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            return {"status": "stopped", "message": "MediaPipe Pose остановлен"}
        return {"status": "not_running", "message": "MediaPipe Pose не запущен"}

launcher = ExeLauncher()