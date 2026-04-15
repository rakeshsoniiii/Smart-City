from __future__ import annotations

import io
import json
import mimetypes
import sys
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import time

# Force UTF-8 stdout so emoji in print() don't crash on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from google import genai
from google.genai import types as genai_types

import os
try:
    from dotenv import load_dotenv
    load_dotenv()  # Load variables from .env file if it exists
except ImportError:
    pass

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
client = genai.Client(api_key=GEMINI_API_KEY)
GEMINI_MODEL = "gemini-flash-latest"


BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

# In-memory store for reported crimes this session
session_crimes: list[dict[str, Any]] = []


def gemini_json(prompt: str, retries: int = 3) -> dict | list:
    """Call Gemini with retry logic for rate-limit (429) errors."""
    for attempt in range(retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.7,
                ),
            )
            return json.loads(response.text)
        except Exception as exc:
            err_str = str(exc)
            # On rate-limit, wait and retry
            if "429" in err_str and attempt < retries - 1:
                wait = 15 * (attempt + 1)  # 15s, 30s, 45s
                print(f"[Rate limit] Waiting {wait}s before retry {attempt + 2}/{retries}...")
                time.sleep(wait)
                continue
            raise


# ─────────────────────────────────────────────
# MODULE 1 – Education: Colleges & Schools
# ─────────────────────────────────────────────
def recommend_colleges(payload: dict[str, Any]) -> dict[str, Any]:
    course = payload.get("course", "Computer Science")
    location = payload.get("location", "Delhi")
    budget = payload.get("budget", 100000)

    prompt = f"""
You are an expert Indian education counsellor with deep knowledge of colleges, universities, and government schemes.

A student is looking for:
- Course: {course}
- City/Region: {location}
- Annual Budget (INR): {budget}

Return a JSON object with:
{{
  "message": "brief context message",
  "results": [
    {{
      "name": "real college name",
      "city": "city",
      "type": "Government/Private/Deemed",
      "courses": ["list"],
      "annual_fees_inr": 95000,
      "distance_km": 5,
      "ranking_score": 8.7,
      "student_rating": 4.5,
      "scholarship": "name of real govt scholarship applicable",
      "match_score": 87.5,
      "explanation": "2-sentence personalized explanation of why this fits",
      "coordinates": [lat, lng]
    }}
  ]
}}

Provide exactly 3 real, well-known Indian colleges or universities that offer {course} near {location}.
Ensure coordinates are accurate geocoords for the city. Fees must realistically match the budget of INR {budget}.
"""
    try:
        result = gemini_json(prompt)
        return result
    except Exception as e:
        return {"results": [], "message": f"Gemini API error: {str(e)}"}


# ─────────────────────────────────────────────
# MODULE 2 – Healthcare: Hospitals
# ─────────────────────────────────────────────
def recommend_hospitals(payload: dict[str, Any]) -> dict[str, Any]:
    symptoms = payload.get("symptoms", "")
    location = payload.get("location", "Delhi")

    prompt = f"""
You are an AI medical triage assistant with comprehensive knowledge of Indian hospitals.

Patient report:
- Location: {location}
- Symptoms: {symptoms}

Analyze this and return a JSON object:
{{
  "severity": "low | medium | critical",
  "message": "medical context and next-action advice",
  "symptoms_analysis": "brief explanation of what these symptoms could indicate",
  "results": [
    {{
      "name": "real hospital name",
      "city": "{location}",
      "distance_km": 2.5,
      "rating": 4.7,
      "emergency_available": true,
      "specialties": ["relevant specialties"],
      "phone": "011-XXXXXXXX",
      "recommendation_score": 9.2,
      "why_recommended": "concise reason this hospital suits these symptoms",
      "coordinates": [lat, lng]
    }}
  ]
}}

Provide 3 real, well-known hospitals in or near {location}, India. Prioritize emergency facilities if severity is critical.
Use accurate geocoordinates. Phone numbers should be realistic Indian formats.
"""
    try:
        return gemini_json(prompt)
    except Exception as e:
        return {"severity": "unknown", "results": [], "message": f"Gemini API error: {str(e)}"}


# ─────────────────────────────────────────────
# MODULE 3 – Safety Routing
# ─────────────────────────────────────────────
def recommend_route(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("source", "")
    destination = payload.get("destination", "")
    time_of_day = payload.get("time_of_day", "Evening")

    prompt = f"""
You are a smart city safety routing engine with knowledge of Indian cities, roads and crime patterns.

Route request:
- Source: {source}
- Destination: {destination}
- Time of day: {time_of_day}

Analyze real road corridors and safety factors. Return JSON:
{{
  "message": "summary of routing rationale",
  "recommended_route": {{
    "name": "route corridor name",
    "source": "{source}",
    "destination": "{destination}",
    "distance_km": 14,
    "estimated_time_min": 35,
    "crime_risk": 2.1,
    "lighting_score": 8.5,
    "crowd_density_score": 7.8,
    "traffic_level": 4.2,
    "risk_score": 2.4,
    "road_type": "Metro-adjacent / Highway / Inner road",
    "ai_explanation": "detailed explanation why this is safest at {time_of_day}",
    "waypoints": [[lat, lng], [lat, lng], [lat, lng]]
  }},
  "alternatives": [
    {{
      "name": "alternative route name",
      "distance_km": 11,
      "risk_score": 3.9,
      "reason_avoided": "why this was ranked lower"
    }}
  ]
}}

Use real road names and accurate waypoint coordinates between {source} and {destination} in India.
"""
    try:
        return gemini_json(prompt)
    except Exception as e:
        return {"recommended_route": None, "alternatives": [], "message": f"Gemini API error: {str(e)}"}


# ─────────────────────────────────────────────
# MODULE 4 – Crime / Theft Reporting
# ─────────────────────────────────────────────
def report_crime(payload: dict[str, Any]) -> dict[str, Any]:
    location = payload.get("location", "")
    description = payload.get("description", "")
    contact = payload.get("contact", "")

    prompt = f"""
You are an intelligent crime intake assistant for the JanAI Smart City platform in India.

Incident filed:
- Location: {location}
- Description: {description}
- Contact: {contact}

Analyze this incident and return a JSON object:
{{
  "category": "theft | harassment | fraud | accident | cybercrime | assault | vandalism | other",
  "severity": "low | medium | high | critical",
  "urgent": true or false,
  "message": "empathetic and actionable message to the victim explaining next steps",
  "recommended_authority": "which authority to contact (e.g. local police, cyber cell, women helpline, etc.)",
  "helpline_numbers": ["112", "1091 (Women Helpline)", ...up to 3 relevant numbers],
  "legal_section": "relevant IPC/BNS section if applicable",
  "immediate_steps": ["3 or 4 specific immediate actionable steps for the victim"],
  "coordinates": [lat, lng]
}}

Provide realistic Indian helpline numbers, IPC/BNS context relevant to the crime type.
"""
    try:
        result = gemini_json(prompt)
        tracking_id = "JAN-" + str(uuid.uuid4())[:8].upper()
        result["tracking_id"] = tracking_id
        result["location"] = location
        result["description"] = description

        # Save to session crimes for analytics
        coords = result.get("coordinates", [28.6139, 77.2090])
        session_crimes.append({
            "id": tracking_id,
            "type": result.get("category", "other"),
            "urgency": result.get("severity", "medium"),
            "location": coords,
            "description": description,
            "timestamp": "Just Now"
        })
        return result
    except Exception as e:
        return {"error": f"Gemini API error: {str(e)}", "tracking_id": "ERROR"}


# ─────────────────────────────────────────────
# MODULE 5 – Anti-Fraud Scanner
# ─────────────────────────────────────────────
def check_fraud(payload: dict[str, Any]) -> dict[str, Any]:
    content = payload.get("content", "")

    prompt = f"""
You are an advanced AI fraud detection system specialized in Indian digital fraud patterns.

Analyze this content for fraud/phishing/scam indicators:
\"\"\"{content}\"\"\"

Return JSON:
{{
  "risk_score": integer from 0 to 100,
  "classification": "safe | suspicious | scam",
  "fraud_type": "phishing | lottery scam | KYC fraud | OTP scam | impersonation | investment fraud | safe | other",
  "analysis": "1-2 clear sentences identifying the specific psychological manipulation technique used",
  "red_flags": ["list", "of", "specific", "red", "flags", "found"],
  "what_to_do": ["3 specific steps", "the user should", "take right now"],
  "real_contact": "if impersonating a real org, provide their real helpline number"
}}

Be specific about Indian fraud patterns (e.g. TRAI scam, KYC fraud, fake lottery, pm kisan scheme fraud).
"""
    try:
        return gemini_json(prompt)
    except Exception as e:
        return {"error": f"Gemini API error: {str(e)}", "risk_score": 0, "classification": "unknown"}


# ─────────────────────────────────────────────
# MODULE 6 – Safe City Analytics
# ─────────────────────────────────────────────
def get_analytics(city: str = "Delhi") -> dict[str, Any]:
    prompt = f"""
You are a Smart City crime analytics system for India.

Generate a realistic safe city analytics report for {city} with current crime pattern data.

Return JSON:
{{
  "city": "{city}",
  "summary": "brief public safety summary",
  "total_incidents_today": 142,
  "safe_zones": ["list of 4 real safe areas in {city}"],
  "hotspot_zones": ["list of 4 real high-risk areas with reason"],
  "incidents": [
    {{
      "id": "unique id",
      "type": "theft | harassment | fraud | accident",
      "urgency": "low | medium | high",
      "location": [lat, lng],
      "area_name": "locality name",
      "description": "brief public incident description"
    }}
  ],
  "safety_tips": ["4 city-specific safety tips for residents"]
}}

Provide exactly 8 incidents with accurate geo-coordinates for real localities in {city}. Use realistic data based on known crime patterns.
"""
    try:
        return gemini_json(prompt)
    except Exception as e:
        return {"city": city, "incidents": [], "summary": f"Gemini API error: {str(e)}"}


# ─────────────────────────────────────────────────────────────────
# HTTP Handler
# ─────────────────────────────────────────────────────────────────
class JanAIHandler(BaseHTTPRequestHandler):

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            self.respond_json({"status": "ok", "service": "JanAI Smart City Platform v2.0", "ai": "Gemini 1.5 Flash"})
            return

        if parsed.path.startswith("/api/analytics/crimes"):
            # ?city=Delhi
            city = "Delhi"
            if "?" in self.path:
                qs = self.path.split("?", 1)[1]
                for part in qs.split("&"):
                    if part.startswith("city="):
                        city = part[5:].replace("+", " ").replace("%20", " ")
            # Combine session crimes + AI-generated ones
            ai_data = get_analytics(city)
            ai_data["session_reports"] = session_crimes
            self.respond_json(ai_data)
            return

        if parsed.path == "/":
            self.serve_file(FRONTEND_DIR / "index.html")
            return

        if parsed.path.startswith("/assets/"):
            relative = parsed.path.removeprefix("/assets/")
            self.serve_file(FRONTEND_DIR / "assets" / relative)
            return

        self.respond_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length else b"{}"

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.respond_json({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            return

        routes = {
            "/api/education/recommend": recommend_colleges,
            "/api/healthcare/recommend": recommend_hospitals,
            "/api/safety/route": recommend_route,
            "/api/crime/report": report_crime,
            "/api/fraud/check": check_fraud,
        }

        handler = routes.get(parsed.path)
        if handler:
            try:
                self.respond_json(handler(payload))
            except Exception as e:
                self.respond_json({"error": str(e)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
        else:
            self.respond_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def serve_file(self, file_path: Path) -> None:
        if not file_path.exists() or not file_path.is_file():
            self.respond_json({"error": "File not found"}, status=HTTPStatus.NOT_FOUND)
            return
        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def respond_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[JanAI] {self.address_string()} - {fmt % args}")


import os

def run(host: str = "0.0.0.0", port: int = None) -> None:
    if port is None:
        port = int(os.environ.get("PORT", 8000))
    server = ThreadingHTTPServer((host, port), JanAIHandler)
    print("\nJanAI Smart City Platform v2.0")
    print("Powered by Google Gemini 1.5 Flash (google-genai SDK)")
    print("Maps: OpenStreetMap + OSRM Routing API")
    print(f"Running on -> http://{host}:{port}\n")
    server.serve_forever()


if __name__ == "__main__":
    run()
