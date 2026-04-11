from deep_translator import GoogleTranslator
from gtts import gTTS
import os
import uuid
import logging

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
if os.path.exists("/data"):
    UPLOAD_DIR = "/data/uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "voice_translations"), exist_ok=True)

SUPPORTED_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    "ar": "Arabic",
    "hi": "Hindi",
    "bn": "Bengali",
    "ur": "Urdu",
    "tr": "Turkish",
    "nl": "Dutch",
    "pl": "Polish",
    "sv": "Swedish",
    "da": "Danish",
    "no": "Norwegian",
    "fi": "Finnish",
    "el": "Greek",
    "he": "Hebrew",
    "th": "Thai",
    "vi": "Vietnamese",
    "id": "Indonesian",
    "ms": "Malay",
    "tl": "Filipino",
    "sw": "Swahili",
    "uk": "Ukrainian",
    "cs": "Czech",
    "ro": "Romanian",
    "hu": "Hungarian",
    "bg": "Bulgarian",
    "hr": "Croatian",
    "sk": "Slovak",
    "sl": "Slovenian",
    "sr": "Serbian",
    "lt": "Lithuanian",
    "lv": "Latvian",
    "et": "Estonian",
    "fa": "Persian",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
    "kn": "Kannada",
    "gu": "Gujarati",
    "mr": "Marathi",
    "pa": "Punjabi",
    "am": "Amharic",
    "my": "Myanmar (Burmese)",
    "km": "Khmer",
    "lo": "Lao",
    "ka": "Georgian",
    "hy": "Armenian",
    "az": "Azerbaijani",
    "uz": "Uzbek",
    "kk": "Kazakh",
    "mn": "Mongolian",
    "ne": "Nepali",
    "si": "Sinhala",
}

# Map for gTTS language codes (some differ from Google Translate)
GTTS_LANG_MAP = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
}


def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text from source language to target language."""
    if source_lang == target_lang:
        return text
    if not text or not text.strip():
        return text
    try:
        translator = GoogleTranslator(source=source_lang, target=target_lang)
        translated = translator.translate(text)
        return translated or text
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text


def detect_language(text: str) -> str:
    """Detect the language of the given text."""
    try:
        detected = GoogleTranslator(source="auto", target="en").translate(text)
        # Use auto detection
        translator = GoogleTranslator(source="auto", target="en")
        translator.translate(text)
        return "auto"
    except Exception:
        return "en"


def text_to_speech(text: str, lang: str) -> str:
    """Convert text to speech and return the file path."""
    try:
        gtts_lang = GTTS_LANG_MAP.get(lang, lang)
        tts = gTTS(text=text, lang=gtts_lang)
        filename = f"{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(UPLOAD_DIR, "voice_translations", filename)
        tts.save(filepath)
        return filepath
    except Exception as e:
        logger.error(f"TTS error: {e}")
        return ""


def get_supported_languages() -> dict:
    """Return dictionary of supported languages."""
    return SUPPORTED_LANGUAGES
