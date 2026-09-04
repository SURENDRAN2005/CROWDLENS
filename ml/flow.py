import cv2
import numpy as np

class OpticalFlowAnalyzer:
    def __init__(self):
        self.prev_gray = None
        
    def analyze(self, frame):
        """
        Calculates Farneback dense optical flow.
        Returns:
            mean_velocity: float
            velocity_variance: float
            direction_entropy: float
            mag: np.ndarray (or None if first frame)
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if self.prev_gray is None:
            self.prev_gray = gray
            return 0.0, 0.0, 0.0, None
            
        # Calculate dense optical flow
        flow = cv2.calcOpticalFlowFarneback(
            self.prev_gray, gray, None, 
            pyr_scale=0.5, levels=3, winsize=15, 
            iterations=3, poly_n=5, poly_sigma=1.2, flags=0
        )
        
        self.prev_gray = gray
        
        # Compute magnitude and angle
        mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        
        # Mean and variance of velocity
        mean_velocity = np.mean(mag)
        velocity_variance = np.var(mag)
        
        # Direction entropy (using histogram of angles weighted by magnitude)
        # 8 bins for directions (N, NE, E, SE, S, SW, W, NW)
        hist, _ = np.histogram(ang, bins=8, range=(0, 2*np.pi), weights=mag)
        
        # Normalize histogram to get probabilities
        prob = hist / (hist.sum() + 1e-6)
        
        # Calculate entropy: -sum(p * log2(p))
        direction_entropy = -np.sum(prob * np.log2(prob + 1e-6))
        
        # Return floats and magnitude array
        return float(mean_velocity), float(velocity_variance), float(direction_entropy), mag
