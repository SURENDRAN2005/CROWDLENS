import asyncio
import cv2
import base64
import json
import time
import os
import sys
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

# Add the parent directory to the path so we can import from ml
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.detector import PersonDetector
from ml.flow import OpticalFlowAnalyzer
from ml.sri_engine import SRIEngine
from ml.structural import StructuralMonitor
from ml.crowd_classifier import classify_event, classify_dynamics

from contextlib import asynccontextmanager

# Global model singletons
detector = None
flow_analyzer = None
sri_engine = None
structural_monitor = None

# Limit concurrent heavy ML inference to avoid CPU saturation when many zones connect
# With semaphore=2, only 2 zones run YOLO at any moment; others yield the event loop
inference_semaphore = asyncio.Semaphore(2)

def init_models():
    global detector, flow_analyzer, sri_engine, structural_monitor
    if detector is None:
        print("Initializing models...")
        detector = PersonDetector("yolov8n.pt") # Switched to Nano model for speed
        flow_analyzer = OpticalFlowAnalyzer()
        sri_engine = SRIEngine()
        structural_monitor = StructuralMonitor(rated_capacity=8000)
        print("Models initialized.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_models()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "CrowdLens Backend Running"}

import shutil

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    videos_dir = os.path.join(base_dir, "data", "videos")
    os.makedirs(videos_dir, exist_ok=True)
    dest = os.path.join(videos_dir, file.filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": file.filename, "status": "uploaded"}

@app.websocket("/ws/analyze")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    video_path = None
    cap = None
    
    try:
        # Wait for the first message to configure the stream
        config_msg = await websocket.receive_text()
        config = json.loads(config_msg)
        video_filename = config.get("video_filename", "crowd1.mp4")
        
        # Hardcoding the path to data/videos for the prototype
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        video_path = os.path.join(base_dir, "data", "videos", video_filename)
        
        if not os.path.exists(video_path):
            await websocket.send_text(json.dumps({"error": f"File not found: {video_path}"}))
            return
            
        cap = cv2.VideoCapture(video_path)
        fps_target = 5
        frame_interval = max(1, int(cap.get(cv2.CAP_PROP_FPS) / fps_target))
        
        frame_count = 0
        grid_area_m2 = 25 # Assuming 5m x 5m grid area
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                # Yield event loop so other connections can progress when looping
                await asyncio.sleep(0.01)
                continue
                
            frame_count += 1
            if frame_count % frame_interval != 0:
                # Yield event loop frequently so other zones get CPU time
                await asyncio.sleep(0)
                continue
                
            # Define a helper to run all heavy CPU-bound OpenCV/ML operations
            def process_frame_sync(f):
                # 640x360 is 4x fewer pixels than 1280x720 → ~4x faster YOLO inference
                f = cv2.resize(f, (640, 360))
                
                # --- 1. Detection ---
                boxes, confidences, fallen_flags = detector.detect(f)
                headcount = len(boxes)
                density = headcount / grid_area_m2
                
                has_fallen = False
                for i, box in enumerate(boxes):
                    x1, y1, x2, y2 = map(int, box)
                    if fallen_flags[i]:
                        color = (0, 0, 255)
                        has_fallen = True
                        cv2.rectangle(f, (x1, y1), (x2, y2), color, 2)
                    else:
                        color = (0, 255, 0)
                        cv2.rectangle(f, (x1, y1), (x2, y2), color, 1)
                    label = f"{confidences[i]:.2f}"
                    cv2.putText(f, label, (x1, max(y1 - 3, 0)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1, cv2.LINE_AA)
                
                # --- 2. Optical Flow ---
                mean_vel, vel_var, dir_entropy, flow_mag = flow_analyzer.analyze(f)
                reverse_flow_ratio = min(1.0, dir_entropy / 3.0) 
                
                # --- 3. SRI & Tension Calculation ---
                sri, risk_band, f_dens, f_press = sri_engine.calculate_sri(
                    density=density, mean_velocity=mean_vel,
                    velocity_variance=vel_var, reverse_flow_ratio=reverse_flow_ratio,
                    fallen_person_flag=has_fallen
                )
                forecast_secs = sri_engine.forecast_critical_time()
                tension = density * (vel_var + 1.0)
                
                # --- 4. Structural Load ---
                triggers, mass_load, is_overloaded, load_pct = structural_monitor.check_overload(headcount)
                
                # --- 5. Crowd Taxonomy & Dynamics ---
                event = classify_event(density, mean_vel, vel_var, dir_entropy, reverse_flow_ratio)
                dynamics = classify_dynamics(density, mean_vel, vel_var, sri, has_fallen)
                
                # --- 6. Generate Heatmap ---
                import numpy as np
                heatmap_layer = np.zeros((f.shape[0], f.shape[1]), dtype=np.float32)
                for box in boxes:
                    x1, y1, x2, y2 = map(int, box)
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    radius = max((x2 - x1), (y2 - y1))
                    y_coords, x_coords = np.ogrid[:heatmap_layer.shape[0], :heatmap_layer.shape[1]]
                    dist = np.sqrt((x_coords - cx)**2 + (y_coords - cy)**2)
                    heatmap_layer += np.exp(-(dist**2)/(2*(radius**2)))
                
                heatmap_norm = cv2.normalize(heatmap_layer, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
                heatmap_color = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_INFERNO)
                frame_heatmap = cv2.addWeighted(f, 0.4, heatmap_color, 0.6, 0)
                
                # --- 7. Encode Frames (quality=50 reduces payload size ~30%) ---
                _, buffer_yolo = cv2.imencode('.jpg', f, [cv2.IMWRITE_JPEG_QUALITY, 50])
                frame_yolo_b64 = base64.b64encode(buffer_yolo).decode('utf-8')
                _, buffer_heat = cv2.imencode('.jpg', frame_heatmap, [cv2.IMWRITE_JPEG_QUALITY, 50])
                frame_heat_b64 = base64.b64encode(buffer_heat).decode('utf-8')
                
                return {
                    "frame_yolo_b64": frame_yolo_b64,
                    "frame_heat_b64": frame_heat_b64,
                    "metrics": {
                        "headcount": headcount, "density": round(density, 2),
                        "mean_velocity": round(mean_vel, 2), "velocity_variance": round(vel_var, 2),
                        "tension": round(tension, 2), "sri": sri, "risk_band": risk_band,
                        "forecast_seconds": forecast_secs, "structural_load_pct": load_pct,
                        "structural_triggers": triggers, "is_overloaded": is_overloaded,
                        "has_fallen": has_fallen,
                        "event_archetype": {
                            "name": event.name, "emoji": event.emoji, "confidence": event.confidence,
                            "visual_signatures": event.visual_signatures, "risk_profile": event.risk_profile,
                        },
                        "dynamics_state": {
                            "state": dynamics.state, "index": dynamics.index, "severity": dynamics.severity,
                            "definition": dynamics.definition, "visual_biomarkers": dynamics.visual_biomarkers,
                        },
                    }
                }
                
            # Acquire semaphore so max 2 zones run heavy inference simultaneously
            async with inference_semaphore:
                result = await asyncio.to_thread(process_frame_sync, frame)
            
            payload = {
                "type": "update",
                "frame": f"data:image/jpeg;base64,{result['frame_yolo_b64']}",
                "frame_heatmap": f"data:image/jpeg;base64,{result['frame_heat_b64']}",
                "metrics": result["metrics"]
            }
            
            await websocket.send_text(json.dumps(payload))
            
            # Allow event loop to process other connections
            await asyncio.sleep(0.01)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error in websocket: {e}")
    finally:
        if cap:
            cap.release()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
