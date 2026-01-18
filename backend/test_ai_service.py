#!/usr/bin/env python3
"""Test script to validate AI service with correct model IDs."""

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from ai_service import AIService, IMAGE_MODEL, LLM_MODEL, GENERATED_IMAGES_DIR


def test_model_ids():
    """Verify correct model IDs are configured."""
    print(f"[TEST] Checking model IDs...")
    print(f"  IMAGE_MODEL: {IMAGE_MODEL}")
    print(f"  LLM_MODEL: {LLM_MODEL}")

    assert IMAGE_MODEL == "gemini-3-pro-image-preview", f"Wrong IMAGE_MODEL: {IMAGE_MODEL}"
    assert LLM_MODEL == "gemini-3-flash-preview", f"Wrong LLM_MODEL: {LLM_MODEL}"
    print("[PASS] Model IDs are correct")


def test_service_initialization():
    """Test AI service can initialize."""
    print(f"\n[TEST] Testing AI service initialization...")
    service = AIService()
    result = service.initialize()

    if result:
        print("[PASS] AI service initialized successfully")
        print(f"  is_ready: {service.is_ready}")
    else:
        print("[WARN] AI service failed to initialize (check GEMINI_API_KEY)")

    return service


async def test_llm_generation(service: AIService):
    """Test LLM text generation with gemini-3-flash-preview."""
    if not service.is_ready:
        print("\n[SKIP] LLM test - service not ready")
        return

    print(f"\n[TEST] Testing LLM generation with {LLM_MODEL}...")

    result = await service.generate_suggestion("Hello, I'm going to talk about Python programming today.")

    if result.get("error"):
        print(f"[FAIL] LLM generation failed: {result['error']}")
        return False

    print(f"[PASS] LLM generation successful")
    print(f"  suggestion: {result.get('suggestion')}")
    return True


async def test_image_generation(service: AIService):
    """Test image generation with gemini-3-pro-image-preview."""
    if not service.is_ready:
        print("\n[SKIP] Image generation test - service not ready")
        return

    print(f"\n[TEST] Testing image generation with {IMAGE_MODEL}...")

    result = await service.generate_image("A simple blue circle on white background")

    if result.get("error"):
        print(f"[FAIL] Image generation failed: {result['error']}")
        return False

    print(f"[PASS] Image generation successful")
    print(f"  filename: {result.get('filename')}")
    print(f"  image_url: {result.get('image_url')}")

    # Verify file exists
    if result.get("filename"):
        filepath = GENERATED_IMAGES_DIR / result["filename"]
        if filepath.exists():
            print(f"  file size: {filepath.stat().st_size} bytes")
        else:
            print(f"[WARN] File not found at {filepath}")

    return True


async def test_name_card_generation(service: AIService):
    """Test name card generation."""
    if not service.is_ready:
        print("\n[SKIP] Name card test - service not ready")
        return

    print(f"\n[TEST] Testing name card generation...")

    result = await service.generate_name_card_image("John Doe", "Software Engineer")

    if result.get("error"):
        print(f"[FAIL] Name card generation failed: {result['error']}")
        return False

    print(f"[PASS] Name card generation successful")
    print(f"  image_url: {result.get('image_url')}")
    return True


async def main():
    print("=" * 60)
    print("HotMike AI Service Tests")
    print("=" * 60)

    # Test 1: Model IDs
    test_model_ids()

    # Test 2: Initialization
    service = test_service_initialization()

    # Test 3: LLM
    await test_llm_generation(service)

    # Test 4: Image generation
    await test_image_generation(service)

    # Test 5: Name card
    await test_name_card_generation(service)

    print("\n" + "=" * 60)
    print("Tests completed")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
