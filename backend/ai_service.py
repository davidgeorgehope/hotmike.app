import asyncio
import base64
import colorsys
import io
import json
import os
import tempfile
import uuid
from typing import Optional
from pathlib import Path

from PIL import Image
from google import genai
from google.genai import types

from config import get_settings, is_ai_available

# Directory for generated images
GENERATED_IMAGES_DIR = Path(__file__).parent / "data" / "generated_images"

# Model IDs
IMAGE_MODEL = "gemini-3-pro-image-preview"
LLM_MODEL = "gemini-3-flash-preview"


def chroma_key_and_crop(image_bytes: bytes) -> bytes:
    """Remove green background using HSV color space and crop to content.

    Uses HSV instead of RGB for better green detection:
    - Hue isolates the color (green = ~80-160° on color wheel, or 0.22-0.44 in 0-1 range)
    - Saturation filters out gray/white pixels that might have green hue
    - Value filters out very dark pixels
    """
    img = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
    pixels = img.load()
    width, height = img.size

    # HSV thresholds for green detection
    HUE_MIN = 0.22  # ~80° (cyan-green boundary)
    HUE_MAX = 0.44  # ~160° (green-yellow boundary)
    SAT_MIN = 0.3   # Filter out desaturated pixels
    VAL_MIN = 0.2   # Filter out very dark pixels

    # First pass: identify green pixels and build alpha map
    alpha_map = [[255] * width for _ in range(height)]

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]

            # Convert RGB (0-255) to normalized (0-1) for colorsys
            r_norm, g_norm, b_norm = r / 255.0, g / 255.0, b / 255.0
            h, s, v = colorsys.rgb_to_hsv(r_norm, g_norm, b_norm)

            # Check if pixel is in green range
            is_green = (HUE_MIN <= h <= HUE_MAX and s >= SAT_MIN and v >= VAL_MIN)

            if is_green:
                alpha_map[y][x] = 0
            else:
                alpha_map[y][x] = 255

    # Second pass: edge feathering for anti-aliased edges
    # Check neighbors to create gradual alpha for edge pixels
    feather_radius = 2
    for y in range(height):
        for x in range(width):
            if alpha_map[y][x] == 255:
                # Count nearby transparent (green) pixels
                green_neighbors = 0
                total_neighbors = 0
                for dy in range(-feather_radius, feather_radius + 1):
                    for dx in range(-feather_radius, feather_radius + 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < height and 0 <= nx < width:
                            total_neighbors += 1
                            if alpha_map[ny][nx] == 0:
                                green_neighbors += 1

                # If this non-green pixel is near green pixels, feather the edge
                if green_neighbors > 0 and total_neighbors > 0:
                    green_ratio = green_neighbors / total_neighbors
                    # Reduce alpha based on proximity to green (more green neighbors = more transparent)
                    if green_ratio > 0.5:
                        alpha_map[y][x] = int(255 * (1 - green_ratio * 0.8))

    # Apply alpha map and find bounding box
    min_x, min_y, max_x, max_y = width, height, 0, 0

    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            new_alpha = alpha_map[y][x]
            pixels[x, y] = (r, g, b, new_alpha)

            if new_alpha > 0:
                # Track bounding box of non-transparent content
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    # Handle edge case: no content found
    if min_x >= max_x or min_y >= max_y:
        output = io.BytesIO()
        img.save(output, format='PNG')
        return output.getvalue()

    # Add padding
    padding = 20
    min_x = max(0, min_x - padding)
    min_y = max(0, min_y - padding)
    max_x = min(width, max_x + padding)
    max_y = min(height, max_y + padding)

    # Crop to content
    cropped = img.crop((min_x, min_y, max_x, max_y))

    output = io.BytesIO()
    cropped.save(output, format='PNG')
    return output.getvalue()


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

    async def _detect_volume(self, audio_bytes: bytes, suffix: str = '.wav') -> float:
        """Detect mean volume of audio using ffmpeg. Returns mean volume in dB."""
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as input_file:
            input_file.write(audio_bytes)
            input_path = input_file.name

        try:
            process = await asyncio.create_subprocess_exec(
                '/usr/bin/ffmpeg', '-i', input_path,
                '-af', 'volumedetect',
                '-f', 'null', '-',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await process.communicate()

            # Parse mean volume from ffmpeg output
            mean_volume = -91.0  # Default to very quiet (silence)
            stderr_text = stderr.decode('utf-8', errors='ignore')
            for line in stderr_text.split('\n'):
                if 'mean_volume:' in line:
                    try:
                        parts = line.split('mean_volume:')[1].strip().split()
                        mean_volume = float(parts[0])
                    except (IndexError, ValueError):
                        pass

            return mean_volume
        finally:
            if os.path.exists(input_path):
                os.unlink(input_path)

    async def _convert_to_wav(self, webm_bytes: bytes) -> tuple[bytes, float]:
        """Convert WebM audio to WAV using ffmpeg. Returns (wav_bytes, mean_volume_db)."""
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as input_file:
            input_file.write(webm_bytes)
            input_path = input_file.name

        output_path = input_path.replace('.webm', '.wav')

        try:
            # Convert to 16kHz mono WAV and detect volume in one pass
            process = await asyncio.create_subprocess_exec(
                '/usr/bin/ffmpeg', '-y', '-i', input_path,
                '-ar', '16000',  # 16kHz sample rate
                '-ac', '1',      # Mono
                '-af', 'volumedetect',
                '-f', 'wav',
                output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await process.communicate()
            stderr_text = stderr.decode('utf-8', errors='ignore')

            # Check for ffmpeg errors
            if process.returncode != 0:
                print(f"[FFmpeg] Conversion failed (exit {process.returncode})", flush=True)
                print(f"[FFmpeg] stderr: {stderr_text[-500:]}", flush=True)
                # Return empty audio with silence indicator
                return b'', -91.0

            # Parse mean volume from ffmpeg output
            mean_volume = -91.0  # Default to very quiet (silence)
            for line in stderr_text.split('\n'):
                if 'mean_volume:' in line:
                    try:
                        # Extract the dB value (e.g., "mean_volume: -25.3 dB")
                        parts = line.split('mean_volume:')[1].strip().split()
                        mean_volume = float(parts[0])
                    except (IndexError, ValueError):
                        pass

            if not os.path.exists(output_path):
                print(f"[FFmpeg] Output file not created!", flush=True)
                return b'', -91.0

            with open(output_path, 'rb') as f:
                wav_bytes = f.read()

            if len(wav_bytes) < 100:
                print(f"[FFmpeg] Output too small: {len(wav_bytes)} bytes", flush=True)

            return wav_bytes, mean_volume
        finally:
            # Clean up temp files
            if os.path.exists(input_path):
                os.unlink(input_path)
            if os.path.exists(output_path):
                os.unlink(output_path)

    async def transcribe_audio_chunk(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> dict:
        """Transcribe an audio chunk using Gemini."""
        if not self.is_ready:
            return {"error": "AI service not available", "text": ""}

        try:
            input_size = len(audio_bytes)
            print(f"[Transcribe] Input: {input_size} bytes, mime: {mime_type}", flush=True)

            # Convert WebM to WAV (Gemini doesn't officially support WebM)
            # Also get volume level to detect silence
            mean_volume = -91.0
            if "webm" in mime_type.lower():
                audio_bytes, mean_volume = await self._convert_to_wav(audio_bytes)
                mime_type = "audio/wav"
                print(f"[Transcribe] Converted to WAV: {len(audio_bytes)} bytes, volume: {mean_volume:.1f} dB", flush=True)
            else:
                # For non-WebM (e.g., direct WAV), still detect volume
                mean_volume = await self._detect_volume(audio_bytes, suffix='.wav')
                print(f"[Transcribe] Direct WAV, volume: {mean_volume:.1f} dB", flush=True)

            # Skip transcription if audio is too quiet (likely silence/noise)
            # Typical speech is -20 to -35 dB, quiet speech -40 to -50 dB, silence < -60 dB
            SILENCE_THRESHOLD_DB = -55.0
            if mean_volume < SILENCE_THRESHOLD_DB:
                print(f"[Transcribe] Skipping - too quiet ({mean_volume:.1f} dB < {SILENCE_THRESHOLD_DB} dB)", flush=True)
                return {"text": "", "error": None, "skipped": "silence"}

            response = await self._client.aio.models.generate_content(
                model=LLM_MODEL,  # Flash is fine with correct audio format
                contents=[
                    "Transcribe this audio verbatim. Return only the spoken words. "
                    "If silent or no speech, return empty string.",
                    types.Part.from_bytes(
                        data=audio_bytes,
                        mime_type=mime_type
                    ),
                ]
            )

            text = response.text.strip() if response.text else ""
            # Filter out silence markers or empty responses
            if text == "[silence]" or text.lower() == "empty string" or not text:
                return {"text": "", "error": None}
            return {"text": text, "error": None}
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
      "importance": "high/medium/low",
      "position": "center|center-left|center-right|top-left|top-right|bottom-left|bottom-right",
      "scale": 0.4
    }}
  ]
}}

Position guidelines:
- Use "center" for full-frame illustrations or hero images
- Use "bottom-right" or "bottom-left" for supporting graphics, charts, lower-thirds
- Use "top-right" or "top-left" for small icons, logos, or badges
- Scale: 0.3=small, 0.5=medium, 0.7=large

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
        """Generate a professional name card overlay using AI with chroma key processing."""
        if not self.is_ready:
            return {"error": "AI service not available", "image_url": None, "filename": None}

        title_text = f"\nTitle: {title}" if title else ""
        prompt = f"""Create a lower-third name card graphic on a bright green chroma key background.

Name: {name}{title_text}

Requirements:
- Background MUST be solid bright green (#00FF00) for chroma keying - no gradients
- The name card graphic should be CENTERED in the image
- Dark semi-transparent rectangular card with rounded corners
- White bold text for the name
- Smaller gray text for the title if provided
- Subtle blue or white accent line (NO GREEN in the graphic itself)
- Clean, professional broadcast TV aesthetic
- ONLY the name card graphic on pure green background
- Do NOT use any green colors in the name card design"""

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

            # Process with chroma key removal and cropping
            processed_bytes = chroma_key_and_crop(image_bytes)

            # Save to file
            filename = f"{uuid.uuid4()}.png"
            filepath = GENERATED_IMAGES_DIR / filename

            with open(filepath, 'wb') as f:
                f.write(processed_bytes)

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
