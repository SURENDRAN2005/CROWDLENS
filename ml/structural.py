class StructuralMonitor:
    def __init__(self, rated_capacity=5000):
        self.rated_capacity = rated_capacity
        self.avg_person_mass_kg = 70
        
    def check_overload(self, headcount, dynamic_factor=1.0, visual_deformation=0.0, resonance_detected=False):
        """
        Analyzes structural signals and triggers warnings based on safety thresholds.
        """
        mass_load = headcount * self.avg_person_mass_kg
        
        triggers = []
        
        if mass_load > 0.80 * self.rated_capacity and dynamic_factor > 1.5:
            triggers.append("Structural Overload Warning")
            
        if visual_deformation > 2.0 or resonance_detected:
            triggers.append("Immediate Evacuation of Structure")
            
        is_overloaded = mass_load > self.rated_capacity
        load_percentage = min(100.0, (mass_load / self.rated_capacity) * 100) if self.rated_capacity > 0 else 0
        
        return triggers, mass_load, is_overloaded, round(load_percentage, 1)
