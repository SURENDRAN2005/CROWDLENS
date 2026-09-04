# CrowdLens - Real-time Crowd Safety Monitoring

CrowdLens is a Progressive Web App (PWA) prototype for real-time crowd safety monitoring. It analyzes video feeds to compute a **Stampede Risk Index (SRI)**, detects structural overload signals, and pushes real-time alerts to a live dashboard — all without facial recognition or tracking individuals.

## Architecture

This project is built with a decoupled architecture optimized for real-time inference and a rich PWA dashboard experience:

1. **Backend (`/backend` & `/ml`)**:
   - Python FastAPI server handling WebSocket connections.
   - Ultralytics YOLOv8n (nano) for lightweight CPU-friendly person detection.
   - OpenCV (Farneback dense optical flow) to calculate crowd velocity and turbulence.
   - SRI Scoring Engine implementing a weighted formula for stampede prediction.

2. **Frontend (`/dashboard`)**:
   - React + Vite PWA.
   - Tailwind CSS for modern glassmorphism styling.
   - Recharts for real-time SRI timeline charting.
   - Live video canvas overlay streaming directly from the backend.

### Real vs Simulated Features

- **Real Implementations**: Person detection, bounding boxes, headcount, density calculation, dense optical flow (mean velocity, variance), and the core SRI calculation formula.
- **Simulated / Estimated**: 
   - **Grid calibration**: A fixed ratio (e.g., 25m²) is assumed per frame for prototype density rather than full 4-point perspective transform.
   - **Structural load**: Simulated by multiplying the current headcount by 70kg, compared against a static capacity threshold.
   - **Event Archetypes**: Basic rule-based classification based on density and flow (e.g., "Dense Gathering" vs "Volatile Crowd").

## Setup Instructions

### 1. Backend Setup

Ensure you have Python 3.12 installed.

```bash
# Create and activate virtual environment
py -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn opencv-python ultralytics websockets

# Run the server
cd backend
py main.py
```
*Note: The first time you run this, Ultralytics will download the `yolov8n.pt` weights (~6MB).*

### 2. Frontend Setup

Ensure you have Node.js installed.

```bash
cd dashboard
npm install

# Run the dev server
npm run dev
```

### 3. Usage

1. Open `http://localhost:5173` in your browser.
2. Select a demo video (e.g., `crowd10.mp4` or `crowd5.mp4`) from the dropdown. (Videos must be placed in `data/videos/`).
3. Click "Start Analysis".
4. The dashboard will connect to the backend WebSocket, process the video, and display real-time bounding boxes, SRI timeline, and alerts.

## Project Structure

```
.
├── backend/          # FastAPI WebSocket Server
│   └── main.py       # Main entry point and processing loop
├── ml/               # Core Computer Vision & Analysis modules
│   ├── detector.py   # YOLOv8 Person Detection
│   ├── flow.py       # OpenCV Farneback Optical Flow
│   ├── sri_engine.py # Stampede Risk Index calculator
│   └── structural.py # Structural Load simulator
├── dashboard/        # React + Vite PWA Frontend
│   └── src/          # React components and Tailwind styles
├── data/
│   └── videos/       # Sample crowd videos (.mp4)
├── MODEL_CARD.md     # Details on AI models and constraints
└── README.md         # This file
```
