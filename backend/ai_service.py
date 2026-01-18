import base64
from typing import Optional
import google.generativeai as genai
from config import get_settings, is_ai_available


class AIService:
    _instance: Optional['AIService'] = None
    _initialized: bool = False

    def __new__(cls) -> 'AIService':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self) -> bool:
        """Configure the Gemini API with the API key."""
        if self._initialized:
            return True

        settings = get_settings()
        if not settings.GEMINI_API_KEY:
            return False

        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._initialized = True
            return True
        except Exception:
            return False

    @property
    def is_ready(self) -> bool:
        """Check if the AI service is ready to use."""
        return self._initialized and is_ai_available()

    async def transcribe_audio_chunk(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
        """Transcribe an audio chunk using Gemini."""
        if not self.is_ready:
            return {"error": "AI service not available", "text": ""}

        try:
            model = genai.GenerativeModel('gemini-1.5-flash')

            # Create the audio data for Gemini
            audio_data = {
                "mime_type": mime_type,
                "data": base64.b64encode(audio_bytes).decode('utf-8')
            }

            response = await model.generate_content_async([
                "Transcribe this audio. Return only the transcribed text, nothing else. If there is no speech, return an empty string.",
                audio_data
            ])

            return {
                "text": response.text.strip(),
                "error": None
            }
        except Exception as e:
            return {
                "text": "",
                "error": str(e)
            }

    async def generate_suggestion(self, transcript: str, context: Optional[str] = None) -> dict:
        """Generate a visual suggestion based on transcript content."""
        if not self.is_ready:
            return {"error": "AI service not available", "suggestion": None}

        try:
            model = genai.GenerativeModel('gemini-1.5-flash')

            prompt = f"""Analyze this transcript from a video recording and suggest a relevant visual/graphic that would enhance the content.

Transcript: "{transcript}"
{f'Additional context: {context}' if context else ''}

Respond in this exact JSON format:
{{
  "should_suggest": true/false,
  "suggestion_text": "Brief description of suggested visual",
  "search_query": "Search terms to find this image",
  "reasoning": "Why this visual would be helpful"
}}

Only suggest a visual if it would genuinely add value. Return should_suggest: false if the content doesn't warrant a visual."""

            response = await model.generate_content_async(prompt)
            text = response.text.strip()

            # Try to parse as JSON
            import json
            # Remove markdown code blocks if present
            if text.startswith('```'):
                text = text.split('\n', 1)[1]
                if text.endswith('```'):
                    text = text[:-3]
                text = text.strip()
            if text.startswith('json'):
                text = text[4:].strip()

            result = json.loads(text)
            return {
                "suggestion": result if result.get("should_suggest") else None,
                "error": None
            }
        except Exception as e:
            return {
                "suggestion": None,
                "error": str(e)
            }

    async def detect_visual_moments(self, transcript_window: str) -> list:
        """Detect moments in the transcript that would benefit from visuals."""
        if not self.is_ready:
            return []

        try:
            model = genai.GenerativeModel('gemini-1.5-flash')

            prompt = f"""Analyze this transcript window and identify moments that would benefit from visual aids.

Transcript: "{transcript_window}"

Respond in this exact JSON format:
{{
  "moments": [
    {{
      "text_snippet": "The part of the transcript",
      "suggestion": "Description of visual to show",
      "search_query": "Search terms for image",
      "importance": "high/medium/low"
    }}
  ]
}}

Only include genuinely useful moments. Return empty moments array if none found."""

            response = await model.generate_content_async(prompt)
            text = response.text.strip()

            # Try to parse as JSON
            import json
            if text.startswith('```'):
                text = text.split('\n', 1)[1]
                if text.endswith('```'):
                    text = text[:-3]
                text = text.strip()
            if text.startswith('json'):
                text = text[4:].strip()

            result = json.loads(text)
            return result.get("moments", [])
        except Exception:
            return []


# Singleton instance
ai_service = AIService()


def get_ai_service() -> AIService:
    """Get the AI service singleton."""
    return ai_service
