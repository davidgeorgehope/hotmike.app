import base64
import json
import os
import uuid
from typing import Optional
from pathlib import Path

from google import genai
from google.genai import types

from config import get_settings, is_ai_available

# Directory for generated images
GENERATED_IMAGES_DIR = Path(__file__).parent / "data" / "generated_images"

# Model IDs
IMAGE_MODEL = "gemini-3-pro-image-preview"
LLM_MODEL = "gemini-3-flash-preview"


class AIService:
    _instance: Optional['AIService'] = None
    _initialized: bool = False
    _client: Optional[genai.Client] = None

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
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
            # Ensure images directory exists
            GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            self._initialized = True
            return True
        except Exception:
            return False

    @property
    def is_ready(self) -> bool:
        """Check if the AI service is ready to use."""
        return self._initialized and is_ai_available() and self._client is not None

    async def transcribe_audio_chunk(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
        """Transcribe an audio chunk using Gemini."""
        if not self.is_ready:
            return {"error": "AI service not available", "text": ""}

        try:
            response = await self._client.aio.models.generate_content(
                model=LLM_MODEL,
                contents=[
                    types.Part.from_bytes(
                        data=audio_bytes,
                        mime_type=mime_type
                    ),
                    "Transcribe this audio. Return only the transcribed text, nothing else. If there is no speech, return an empty string."
                ]
            )

            return {
                "text": response.text.strip() if response.text else "",
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
            prompt = f"""Analyze this transcript from a video recording and suggest a relevant visual/graphic that would enhance the content.

Transcript: "{transcript}"
{f'Additional context: {context}' if context else ''}

Respond in this exact JSON format:
{{
  "should_suggest": true/false,
  "suggestion_text": "Brief description of suggested visual",
  "search_query": "Search terms to find this image",
  "image_prompt": "Detailed prompt for generating this image with AI (describe the scene, style, composition)",
  "reasoning": "Why this visual would be helpful"
}}

Only suggest a visual if it would genuinely add value. Return should_suggest: false if the content doesn't warrant a visual."""

            response = await self._client.aio.models.generate_content(
                model=LLM_MODEL,
                contents=prompt
            )
            text = response.text.strip() if response.text else ""

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
            prompt = f"""Analyze this transcript window and identify moments that would benefit from visual aids.

Transcript: "{transcript_window}"

Respond in this exact JSON format:
{{
  "moments": [
    {{
      "text_snippet": "The part of the transcript",
      "suggestion": "Description of visual to show",
      "search_query": "Search terms for image",
      "image_prompt": "Detailed prompt for AI image generation",
      "importance": "high/medium/low"
    }}
  ]
}}

Only include genuinely useful moments. Return empty moments array if none found."""

            response = await self._client.aio.models.generate_content(
                model=LLM_MODEL,
                contents=prompt
            )
            text = response.text.strip() if response.text else ""

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

    async def generate_image(self, prompt: str, aspect_ratio: str = "16:9") -> dict:
        """Generate an image using Gemini 3 Pro Image."""
        if not self.is_ready:
            return {"error": "AI service not available", "image_url": None, "filename": None}

        try:
            response = await self._client.aio.models.generate_content(
                model=IMAGE_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"]
                )
            )

            # Extract image from response
            image_bytes = None
            if hasattr(response, 'candidates'):
                for candidate in response.candidates:
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        for part in candidate.content.parts:
                            if hasattr(part, 'inline_data') and part.inline_data:
                                if hasattr(part.inline_data, 'data') and part.inline_data.data:
                                    image_bytes = part.inline_data.data
                                    break
                    if image_bytes:
                        break

            if not image_bytes:
                return {"error": "No image generated", "image_url": None, "filename": None}

            # Save to file
            filename = f"{uuid.uuid4()}.png"
            filepath = GENERATED_IMAGES_DIR / filename

            with open(filepath, 'wb') as f:
                f.write(image_bytes)

            return {
                "error": None,
                "filename": filename,
                "image_url": f"/api/generated-images/{filename}"
            }
        except Exception as e:
            return {
                "error": str(e),
                "image_url": None,
                "filename": None
            }

    async def generate_image_with_positioning(self, prompt: str, context: str = "", aspect_ratio: str = "16:9") -> dict:
        """Generate an image and get LLM-suggested positioning for it."""
        if not self.is_ready:
            return {"error": "AI service not available", "image_url": None, "filename": None, "position": "bottom-right", "scale": 0.4}

        # First generate the image
        image_result = await self.generate_image(prompt, aspect_ratio)
        if image_result.get("error"):
            return {
                **image_result,
                "position": "bottom-right",
                "scale": 0.4
            }

        # Ask LLM for positioning suggestion
        try:
            positioning_prompt = f"""An overlay image was generated for a video recording.

Image prompt: "{prompt}"
{f'Context: {context}' if context else ''}

Where should this overlay appear on the video recording to be most effective without blocking the speaker?
Options: center, center-left, center-right, top-left, top-right, bottom-left, bottom-right

What scale should it be? (0.3 = small, 0.5 = medium, 0.7 = large)

Consider:
- Informational graphics work well in corners (bottom-right is common for lower-thirds)
- Full-frame illustrations may need center positioning
- Don't block the speaker's face (usually center/left of frame)

Respond ONLY with valid JSON, no other text:
{{"position": "bottom-right", "scale": 0.4}}"""

            response = await self._client.aio.models.generate_content(
                model=LLM_MODEL,
                contents=positioning_prompt
            )
            text = response.text.strip() if response.text else ""

            # Remove markdown code blocks if present
            if text.startswith('```'):
                text = text.split('\n', 1)[1]
                if text.endswith('```'):
                    text = text[:-3]
                text = text.strip()
            if text.startswith('json'):
                text = text[4:].strip()

            positioning = json.loads(text)

            # Validate position
            valid_positions = ['center', 'center-left', 'center-right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
            position = positioning.get("position", "bottom-right")
            if position not in valid_positions:
                position = "bottom-right"

            # Validate scale
            scale = positioning.get("scale", 0.4)
            if not isinstance(scale, (int, float)) or scale < 0.1 or scale > 1.0:
                scale = 0.4

            return {
                **image_result,
                "position": position,
                "scale": scale
            }
        except Exception:
            # Default positioning if LLM fails
            return {
                **image_result,
                "position": "bottom-right",
                "scale": 0.4
            }

    async def generate_name_card_image(self, name: str, title: Optional[str] = None) -> dict:
        """Generate a professional name card overlay using AI."""
        if not self.is_ready:
            return {"error": "AI service not available", "image_url": None, "filename": None}

        title_text = f", {title}" if title else ""
        prompt = f"""Create an isolated lower-third name card graphic.

Name: {name}{title_text}

This is a PNG overlay graphic, NOT a video or scene. Generate ONLY the graphic element itself:
- Dark semi-transparent rectangular background
- White text for the name (bold, prominent)
- Smaller gray text for the title if provided
- Subtle accent line or design element
- Left-aligned text
- The graphic should be positioned in the lower-left area of the frame
- Clean, professional broadcast TV aesthetic
- NO background scene, NO video frame, NO person - ONLY the name card graphic itself"""

        return await self.generate_image(prompt, aspect_ratio="16:9")

    async def generate_visual_from_marker(self, marker_text: str) -> dict:
        """Generate an image for a [VISUAL:] marker in a talk track."""
        if not self.is_ready:
            return {"error": "AI service not available", "image_url": None, "filename": None}

        prompt = f"""Create a professional visual for a video presentation.

Description: {marker_text}

Requirements:
- High quality, professional image suitable for video overlay
- Clear, uncluttered composition
- Good contrast and visibility
- Appropriate for business/educational presentation
- 16:9 aspect ratio for video
- Photorealistic or clean illustration style as appropriate"""

        return await self.generate_image(prompt, aspect_ratio="16:9")


# Singleton instance
ai_service = AIService()


def get_ai_service() -> AIService:
    """Get the AI service singleton."""
    return ai_service
