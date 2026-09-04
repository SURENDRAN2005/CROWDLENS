"""
detector.py  –  Dense-crowd person detector for CrowdLens
================================================================
Strategy:
  1. Full-frame inference with YOLOv8s (small, 3× more params than nano)
  2. SAHI-style overlapping slice inference: N×M tiles with 20% overlap
     → prevents people at tile boundaries from being missed
  3. Weighted Soft-NMS to merge detections from all passes
     → keeps high-confidence boxes while suppressing clear duplicates

Model: yolov8s.pt (≈22MB, auto-downloaded on first run)
Conf threshold : 0.12  (catch partial occlusions & heads-only)
IOU (slice NMS): 0.30  (relaxed to preserve overlapping people in dense packs)
Final merge NMS: 0.40  (tighter — clean up cross-tile duplicates)
"""

import cv2
import numpy as np
from ultralytics import YOLO


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _xyxy_to_xywh(boxes: np.ndarray) -> np.ndarray:
    """Convert [x1,y1,x2,y2] → [x,y,w,h]."""
    out = boxes.copy().astype(np.float32)
    out[:, 2] = boxes[:, 2] - boxes[:, 0]
    out[:, 3] = boxes[:, 3] - boxes[:, 1]
    return out


def _run_on_patch(model, patch: np.ndarray, conf: float, iou: float):
    """Run YOLO on a single image patch; return (boxes_xyxy, confs) arrays."""
    if patch.size == 0:
        return np.empty((0, 4), dtype=np.float32), np.empty(0, dtype=np.float32)
    results = model(patch, classes=[0], conf=conf, iou=iou,
                    verbose=False, imgsz=640)
    boxes_list, conf_list = [], []
    for r in results:
        for box in r.boxes:
            boxes_list.append(box.xyxy[0].tolist())
            conf_list.append(box.conf[0].item())
    if not boxes_list:
        return np.empty((0, 4), dtype=np.float32), np.empty(0, dtype=np.float32)
    return np.array(boxes_list, dtype=np.float32), np.array(conf_list, dtype=np.float32)


def _soft_nms(boxes_xywh, scores, sigma=0.5, score_thresh=0.10):
    """
    Gaussian Soft-NMS: instead of hard-suppressing overlapping boxes,
    decays their score by a Gaussian.  Better recall in dense scenes.
    Returns indices of surviving boxes.
    """
    boxes = boxes_xywh.copy().astype(np.float64)
    scores = scores.copy().astype(np.float64)
    N = len(boxes)
    for i in range(N):
        max_idx = np.argmax(scores[i:]) + i
        boxes[[i, max_idx]] = boxes[[max_idx, i]]
        scores[[i, max_idx]] = scores[[max_idx, i]]
        bx1 = boxes[i+1:, 0]
        by1 = boxes[i+1:, 1]
        bx2 = boxes[i+1:, 0] + boxes[i+1:, 2]
        by2 = boxes[i+1:, 1] + boxes[i+1:, 3]
        ix1 = np.maximum(boxes[i, 0], bx1)
        iy1 = np.maximum(boxes[i, 1], by1)
        ix2 = np.minimum(boxes[i, 0] + boxes[i, 2], bx2)
        iy2 = np.minimum(boxes[i, 1] + boxes[i, 3], by2)
        iw = np.maximum(0, ix2 - ix1)
        ih = np.maximum(0, iy2 - iy1)
        inter = iw * ih
        area_i = boxes[i, 2] * boxes[i, 3]
        area_j = boxes[i+1:, 2] * boxes[i+1:, 3]
        iou = inter / (area_i + area_j - inter + 1e-6)
        scores[i+1:] *= np.exp(-(iou ** 2) / sigma)
    return np.where(scores >= score_thresh)[0]


# ---------------------------------------------------------------------------
# PersonDetector
# ---------------------------------------------------------------------------

class PersonDetector:
    def __init__(self, model_path="yolov8s.pt"):
        print(f"[Detector] Loading model: {model_path}")
        self.model = YOLO(model_path)   # auto-downloads if not present
        self.conf  = 0.12               # low threshold — catch heads/partial bodies
        self.iou   = 0.30               # relaxed NMS per slice

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, frame: np.ndarray):
        """
        Returns:
            boxes      : list of [x1, y1, x2, y2]  (float, full-frame coords)
            confidences: list of float
            fallen_flags: list of bool
        """
        h, w = frame.shape[:2]

        all_boxes  = np.empty((0, 4), dtype=np.float32)
        all_scores = np.empty(0,      dtype=np.float32)

        # ── Pass 1: Full frame ──────────────────────────────────────────
        fb, fc = _run_on_patch(self.model, frame, self.conf, self.iou)
        all_boxes  = np.vstack([all_boxes,  fb]) if len(fb) else all_boxes
        all_scores = np.concatenate([all_scores, fc])

        # ── Pass 2: Overlapping 3×3 SAHI tiles (20% overlap) ───────────
        slices = self._make_slices(w, h, cols=3, rows=3, overlap=0.20)
        for (x1, y1, x2, y2) in slices:
            patch = frame[y1:y2, x1:x2]
            pb, pc = _run_on_patch(self.model, patch, self.conf, self.iou)
            if len(pb) == 0:
                continue
            # Translate patch coords → full-frame coords
            pb[:, 0] += x1; pb[:, 2] += x1
            pb[:, 1] += y1; pb[:, 3] += y1
            all_boxes  = np.vstack([all_boxes, pb])
            all_scores = np.concatenate([all_scores, pc])

        # ── Pass 3: Dense-region focus — 4 centre-biased tiles ─────────
        # The most dangerous zone is usually the centre.
        centre_slices = [
            (w//4,    h//4,    3*w//4, 3*h//4),   # centre
            (0,       h//4,    w//2,   3*h//4),   # centre-left
            (w//2,    h//4,    w,      3*h//4),   # centre-right
            (w//4,    0,       3*w//4, h//2),     # centre-top
        ]
        for (cx1, cy1, cx2, cy2) in centre_slices:
            patch = frame[cy1:cy2, cx1:cx2]
            pb, pc = _run_on_patch(self.model, patch, self.conf * 0.85, self.iou)
            if len(pb) == 0:
                continue
            pb[:, 0] += cx1; pb[:, 2] += cx1
            pb[:, 1] += cy1; pb[:, 3] += cy1
            all_boxes  = np.vstack([all_boxes, pb])
            all_scores = np.concatenate([all_scores, pc])

        if len(all_boxes) == 0:
            return [], [], []

        # ── Merge: Soft-NMS → final hard-NMS ───────────────────────────
        xywh = _xyxy_to_xywh(all_boxes)

        # First: Soft-NMS decays near-duplicates without hard-killing them
        keep_soft = _soft_nms(xywh, all_scores, sigma=0.5, score_thresh=0.10)
        xywh_k   = xywh[keep_soft]
        scores_k = all_scores[keep_soft]
        boxes_k  = all_boxes[keep_soft]

        # Second: Hard-NMS to remove genuine overlapping duplicates
        indices = cv2.dnn.NMSBoxes(
            xywh_k.tolist(),
            scores_k.tolist(),
            score_threshold=0.10,
            nms_threshold=0.42,
        )

        final_boxes, final_confs, final_fallen = [], [], []
        if len(indices) > 0:
            indices = indices.flatten()
            frame_h = frame.shape[0]
            for i in indices:
                x1, y1, x2, y2 = boxes_k[i]
                bw = x2 - x1
                bh = y2 - y1
                # Fallen heuristic: wide box AND not in very top of frame
                is_fallen = (bw > bh * 1.5) and (y2 > frame_h * 0.25)
                final_boxes.append([float(x1), float(y1), float(x2), float(y2)])
                final_confs.append(float(scores_k[i]))
                final_fallen.append(is_fallen)

        return final_boxes, final_confs, final_fallen

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_slices(w, h, cols=3, rows=3, overlap=0.20):
        """
        Generate overlapping tile coordinates.
        overlap=0.20 means each tile overlaps its neighbour by 20% of its size.
        """
        slices = []
        sw = w // cols  # base slice width
        sh = h // rows  # base slice height
        ox = int(sw * overlap)
        oy = int(sh * overlap)
        for r in range(rows):
            for c in range(cols):
                x1 = max(0, c * sw - ox)
                y1 = max(0, r * sh - oy)
                x2 = min(w, (c + 1) * sw + ox)
                y2 = min(h, (r + 1) * sh + oy)
                slices.append((x1, y1, x2, y2))
        return slices
