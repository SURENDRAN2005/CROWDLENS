# Model Card: CrowdLens AI Pipeline

## Overview
CrowdLens uses a composite pipeline of off-the-shelf and heuristic-based models to estimate crowd dynamics and stampede risk.

## Pipeline Components

### 1. Person Detection (YOLOv8 Nano)
- **Model:** `yolov8n.pt` (Ultralytics)
- **Task:** 2D Bounding Box detection (Class 0: Person only).
- **Performance:** Highly optimized for CPU inference, sacrificing some recall in extremely dense occluded crowds (e.g., protests) in favor of frame rate.
- **Limitations:** Struggles with heavily occluded individuals or top-down fisheye perspectives where people look like dots. 

### 2. Optical Flow (OpenCV Farneback)
- **Model:** Dense Optical Flow (Heuristic/Algorithmic)
- **Task:** Estimates pixel-level motion vectors between consecutive frames.
- **Outputs:** Mean Velocity, Velocity Variance (Turbulence), Direction Entropy.
- **Limitations:** Sensitive to camera shake and lighting changes.

### 3. Fallen Person Detection (Heuristic)
- **Method:** Aspect ratio of the YOLO bounding box (width > 1.5 * height).
- **Caveats:** This is a cheap approximation for the prototype. It is highly sensitive to camera angle and perspective. A robust implementation would require full pose estimation (e.g., MoveNet or YOLO-Pose).

### 4. Stampede Risk Index (SRI)
- **Method:** Weighted sum of normalized features: `Density (30%) + Pressure Proxy (20%) + Velocity Variance (15%) + Compressibility (15%) + Reverse Flow (10%) + Fallen Flag (5%) + Age Index (5%)`.
- **Scaling:** Thresholds for normalization (e.g., max density = 5 ppl/m²) are hardcoded estimations for the prototype and need real-world geospatial calibration.

## Privacy & Bias Caveats

- **Strict Privacy:** The pipeline processes frames entirely in memory. **No facial recognition is used.** No individual tracking IDs are persisted across the session. 
- **Bias in Age Estimation (Skipped):** The challenge mentioned gait-based age estimation. We deliberately set this to a constant (0) in the prototype because inferring age from gait via CV is highly speculative, error-prone, and introduces significant bias against individuals with mobility impairments.
- **Attire-based Classification (Skipped):** Classifying the event archetype based on attire (e.g., "Protest" vs "Festival") is unreliable. Instead, the prototype uses crowd density and flow patterns as a proxy to label the crowd's state.
