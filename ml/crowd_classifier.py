"""
crowd_classifier.py  –  Rule-based Crowd Taxonomy & Dynamics State classifier
===============================================================================
Based on the CrowdLens challenge spec tables:

  EVENT TYPES  (Crowd Taxonomy):
    Temple Festival | Sports Stadium | Concert/EDM |
    Protest/Rally   | Procession     | Public Gathering

  DYNAMICS STATES  (6-state machine):
    Passive → Active → Aggressive → Volatile → Panic → Dispersing

Both classifiers use the same feature vector already computed by the SRI engine:
  • density            – people/m²
  • mean_velocity      – px/s (proxy for movement speed)
  • velocity_variance  – turbulence / energy
  • direction_entropy  – bits; high = many competing directions
  • reverse_flow_ratio – fraction of crowd moving "back"
  • sri                – Stampede Risk Index 0–100
  • has_fallen         – bool

NOTE: These are HEURISTIC classifiers, labelled as such in the UI.
Real-world deployment would require domain-calibrated thresholds.
"""

from dataclasses import dataclass
from typing import Tuple


# ─────────────────────────────────────────────────────────
#  Data classes
# ─────────────────────────────────────────────────────────

@dataclass
class EventArchetype:
    name: str
    confidence: float           # 0.0 – 1.0
    visual_signatures: str
    risk_profile: str
    emoji: str


@dataclass
class DynamicsState:
    state: str                  # e.g. "Volatile"
    index: int                  # 0=Passive … 5=Dispersing
    definition: str
    visual_biomarkers: str
    severity: str               # LOW | MEDIUM | HIGH | CRITICAL


# ─────────────────────────────────────────────────────────
#  Event archetype taxonomy
# ─────────────────────────────────────────────────────────

_ARCHETYPES = [
    {
        "name": "Temple Festival",
        "emoji": "🛕",
        "visual_signatures": "Traditional attire, diyas, narrow corridors",
        "risk_profile": "High stampede risk in bottlenecks; rear crowds unaware of front compression",
        # Key signals: moderate–high density, LOW velocity (slow procession), low entropy
        "rules": lambda d, v, vv, ent, rfr: (
            1.5 <= d <= 4.0 and v < 1.5 and ent < 2.0
        ),
    },
    {
        "name": "Sports Stadium",
        "emoji": "🏟️",
        "visual_signatures": "Uniform colors, seated sections, wave patterns",
        "risk_profile": "Crush risk at exits; post-match surge compression",
        # Key signals: high density sections, moderate velocity, periodic waves → medium variance
        "rules": lambda d, v, vv, ent, rfr: (
            d >= 1.5 and 0.5 <= vv <= 5.0 and ent < 2.5
        ),
    },
    {
        "name": "Concert / EDM",
        "emoji": "🎤",
        "visual_signatures": "Stage-facing, raised hands, phone lights",
        "risk_profile": "Trampling; mosh pit density spikes; heat exhaustion clusters",
        # Key signals: very high density near stage, HIGH variance (mosh), forward surge
        "rules": lambda d, v, vv, ent, rfr: (
            d >= 2.5 and vv >= 3.0 and rfr < 0.3
        ),
    },
    {
        "name": "Protest / Rally",
        "emoji": "✊",
        "visual_signatures": "Flags, banners, police lines, chanting",
        "risk_profile": "Rapid escalation to volatile; kettling; dispersal patterns",
        # Key signals: moderate density, HIGH entropy (many directions), moderate–high velocity
        "rules": lambda d, v, vv, ent, rfr: (
            0.8 <= d <= 3.5 and ent >= 2.2 and rfr >= 0.25
        ),
    },
    {
        "name": "Procession",
        "emoji": "🚶",
        "visual_signatures": "Linear movement, slow pace, intermittent stops",
        "risk_profile": "Compression at halts; stop-wave propagation",
        # Key signals: low density, very low velocity, very low entropy (linear)
        "rules": lambda d, v, vv, ent, rfr: (
            d < 1.5 and v < 1.0 and ent < 1.5
        ),
    },
    {
        "name": "Public Gathering",
        "emoji": "👥",
        "visual_signatures": "Mixed orientation, static clusters",
        "risk_profile": "General density management; vulnerable demographics",
        # Catch-all: doesn't strongly match any other pattern
        "rules": lambda d, v, vv, ent, rfr: True,
    },
]


def classify_event(
    density: float,
    mean_velocity: float,
    velocity_variance: float,
    direction_entropy: float,
    reverse_flow_ratio: float,
) -> EventArchetype:
    """
    Returns the best-matching event archetype given the current feature vector.
    Archetypes are evaluated in priority order; first match wins.
    Confidence is a soft heuristic based on how strongly features match.
    """
    d, v, vv, ent, rfr = density, mean_velocity, velocity_variance, direction_entropy, reverse_flow_ratio

    for arch in _ARCHETYPES:
        try:
            matched = arch["rules"](d, v, vv, ent, rfr)
        except Exception:
            matched = False

        if matched:
            # Compute a rough confidence based on signal strength
            # (how far features are from the rule boundaries)
            confidence = _estimate_confidence(arch["name"], d, v, vv, ent, rfr)
            return EventArchetype(
                name=arch["name"],
                confidence=round(confidence, 2),
                visual_signatures=arch["visual_signatures"],
                risk_profile=arch["risk_profile"],
                emoji=arch["emoji"],
            )

    # Should never reach here (Public Gathering is catch-all)
    last = _ARCHETYPES[-1]
    return EventArchetype(
        name=last["name"], confidence=0.50,
        visual_signatures=last["visual_signatures"],
        risk_profile=last["risk_profile"],
        emoji=last["emoji"],
    )


def _estimate_confidence(name, d, v, vv, ent, rfr) -> float:
    """Simple confidence scoring — how strongly features match each type."""
    if name == "Temple Festival":
        return min(1.0, 0.5 + (d / 4.0) * 0.3 + (1.5 - min(v, 1.5)) / 1.5 * 0.2)
    if name == "Sports Stadium":
        return min(1.0, 0.5 + min(vv, 5.0) / 5.0 * 0.3 + min(d, 3.0) / 3.0 * 0.2)
    if name == "Concert / EDM":
        return min(1.0, 0.5 + min(d, 5.0) / 5.0 * 0.25 + min(vv, 8.0) / 8.0 * 0.25)
    if name == "Protest / Rally":
        return min(1.0, 0.5 + min(ent, 3.0) / 3.0 * 0.3 + min(rfr, 0.6) / 0.6 * 0.2)
    if name == "Procession":
        return min(1.0, 0.5 + max(0, 1.0 - v) * 0.3 + max(0, 1.5 - ent) / 1.5 * 0.2)
    return 0.55   # Public Gathering catch-all


# ─────────────────────────────────────────────────────────
#  Crowd Dynamics 6-state machine
# ─────────────────────────────────────────────────────────

_DYNAMICS = [
    {
        "state": "Passive",
        "index": 0,
        "severity": "LOW",
        "definition": "Static/slow-moving; low energy",
        "visual_biomarkers": "Standing still, seated, minimal arm movement",
        "rules": lambda d, v, vv, sri, fallen: v < 0.8 and vv < 1.0 and sri < 30,
    },
    {
        "state": "Active",
        "index": 1,
        "severity": "LOW",
        "definition": "Purposeful movement; normal energy",
        "visual_biomarkers": "Walking, queueing, cheering, clapping",
        "rules": lambda d, v, vv, sri, fallen: 0.8 <= v < 3.0 and vv < 3.0 and sri < 45,
    },
    {
        "state": "Aggressive",
        "index": 2,
        "severity": "MEDIUM",
        "definition": "Hostile body language; confrontation",
        "visual_biomarkers": "Chest-forward posture, pointing, pushing",
        "rules": lambda d, v, vv, sri, fallen: vv >= 3.0 and sri < 56 and not fallen,
    },
    {
        "state": "Volatile",
        "index": 3,
        "severity": "HIGH",
        "definition": "Unstable; rapid state-switch potential",
        "visual_biomarkers": "Sudden direction changes, raised voices",
        "rules": lambda d, v, vv, sri, fallen: 56 <= sri < 76 or (vv >= 5.0 and d >= 2.0),
    },
    {
        "state": "Panic",
        "index": 4,
        "severity": "CRITICAL",
        "definition": "Flight response; disordered evacuation",
        "visual_biomarkers": "Running against flow, falling, dropped items",
        "rules": lambda d, v, vv, sri, fallen: sri >= 76 or fallen,
    },
    {
        "state": "Dispersing",
        "index": 5,
        "severity": "MEDIUM",
        "definition": "Controlled/uncontrolled exit",
        "visual_biomarkers": "Radial outward flow, emptying central zones",
        # High velocity + density dropping — use velocity as proxy
        "rules": lambda d, v, vv, sri, fallen: v >= 3.0 and d < 1.0 and sri < 56,
    },
]


def classify_dynamics(
    density: float,
    mean_velocity: float,
    velocity_variance: float,
    sri: float,
    has_fallen: bool,
) -> DynamicsState:
    """
    Evaluates the 6-state dynamics machine in order of severity
    (Panic first, then Volatile, etc.) so the highest risk wins.
    """
    # Evaluate Panic & Dispersing first (highest priority edge states)
    priority_order = [4, 3, 5, 2, 1, 0]   # Panic, Volatile, Dispersing, Aggressive, Active, Passive

    for idx in priority_order:
        dyn = _DYNAMICS[idx]
        try:
            matched = dyn["rules"](density, mean_velocity, velocity_variance, sri, has_fallen)
        except Exception:
            matched = False
        if matched:
            return DynamicsState(
                state=dyn["state"],
                index=dyn["index"],
                definition=dyn["definition"],
                visual_biomarkers=dyn["visual_biomarkers"],
                severity=dyn["severity"],
            )

    # Default: Passive
    p = _DYNAMICS[0]
    return DynamicsState(
        state=p["state"], index=p["index"],
        definition=p["definition"],
        visual_biomarkers=p["visual_biomarkers"],
        severity=p["severity"],
    )
