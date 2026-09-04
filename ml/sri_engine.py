from collections import deque
import numpy as np

class SRIEngine:
    def __init__(self, history_len_frames=450): # 90 seconds at 5 fps
        # Store history for forecasting
        self.history = deque(maxlen=history_len_frames)
        self.prev_density = 0.0
        
    def calculate_sri(self, density, mean_velocity, velocity_variance, reverse_flow_ratio, fallen_person_flag, age_vulnerability_index=0):
        """
        Calculates Stampede Risk Index (SRI)
        
        SRI = 0.30*f(density) + 0.20*f(pressure_proxy) + 0.15*f(velocity_variance)
            + 0.15*f(compressibility_index) + 0.10*f(reverse_flow_ratio)
            + 0.05*f(fallen_person_flag) + 0.05*f(age_vulnerability_index)
        """
        # Compressibility: rate of density increase
        compressibility = max(0, density - self.prev_density)
        self.prev_density = density
        
        # Pressure proxy: density * velocity^2
        pressure_proxy = density * (mean_velocity ** 2)
        
        # Normalize functions to 0-100 (using simple scaling for prototype)
        # Assuming density max is around 5 people/m2
        f_density = min(100, (density / 5.0) * 100) 
        
        # Assuming max pressure proxy is around 50
        f_pressure = min(100, (pressure_proxy / 50.0) * 100)
        
        # Assuming velocity variance max is around 10
        f_vel_var = min(100, (velocity_variance / 10.0) * 100)
        
        # Assuming max compressibility is 1.0/frame
        f_comp = min(100, (compressibility / 1.0) * 100)
        
        # Reverse flow ratio 0.0 - 1.0
        f_rev_flow = reverse_flow_ratio * 100
        
        f_fallen = 100 if fallen_person_flag else 0
        f_age = age_vulnerability_index * 100 # Default to 0
        
        sri = (
            0.30 * f_density +
            0.20 * f_pressure +
            0.15 * f_vel_var +
            0.15 * f_comp +
            0.10 * f_rev_flow +
            0.05 * f_fallen +
            0.05 * f_age
        )
        
        self.history.append(sri)
        
        # Risk bands: GREEN(0–30) / YELLOW(31–55) / ORANGE(56–75) / RED(76–90) / BLACK(91–100)
        if sri <= 30:
            band = "GREEN"
        elif sri <= 55:
            band = "YELLOW"
        elif sri <= 75:
            band = "ORANGE"
        elif sri <= 90:
            band = "RED"
        else:
            band = "BLACK"
            
        return round(sri, 2), band, f_density, f_pressure
        
    def forecast_critical_time(self, zone_id="Zone-B", threshold=76):
        """
        Simple linear regression to predict when SRI crosses critical threshold (e.g. RED band = 76).
        Returns formatted prediction string, or None if trend is negative or insufficient data.
        """
        if len(self.history) < 10:
            return None
            
        x = np.arange(len(self.history))
        y = np.array(self.history)
        
        # Linear fit: y = mx + c
        A = np.vstack([x, np.ones(len(x))]).T
        m, c = np.linalg.lstsq(A, y, rcond=None)[0]
        
        if m <= 0:
            return None # Not increasing
            
        # Time to threshold in frames
        frames_to_threshold = (threshold - c) / m - len(self.history)
        
        if frames_to_threshold <= 0:
            return f"Stampede risk critical now at {zone_id}"
            
        # Assuming ~5 fps processing
        seconds_to_threshold = frames_to_threshold / 5.0
        minutes = round(seconds_to_threshold / 60.0)
        
        return f"Stampede risk critical in {minutes} minutes at {zone_id}"
