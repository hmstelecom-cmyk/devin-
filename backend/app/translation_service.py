from deep_translator import GoogleTranslator
from gtts import gTTS
import os
import uuid
import logging
import subprocess
import speech_recognition as sr
import imageio_ffmpeg

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

# Map language codes that differ between our app and Google Translate API
TRANSLATE_LANG_MAP = {
    "he": "iw",
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
}

# Map for gTTS language codes (some differ from Google Translate)
GTTS_LANG_MAP = {
    "he": "iw",
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
        src = TRANSLATE_LANG_MAP.get(source_lang, source_lang)
        tgt = TRANSLATE_LANG_MAP.get(target_lang, target_lang)
        translator = GoogleTranslator(source=src, target=tgt)
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


def transcribe_audio(filepath: str, source_lang: str = "en") -> str:
    """Transcribe audio file to text using Google Speech Recognition.
    
    Converts audio to WAV format first (required by speech_recognition),
    then uses Google's free web speech API for transcription.
    Includes retry with 'en-US' fallback if primary language fails.
    """
    wav_path = ""
    try:
        # Convert to WAV using ffmpeg (handles webm, ogg, mp3, etc.)
        wav_path = filepath.rsplit(".", 1)[0] + "_converted.wav"
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        logger.info(f"Transcribe: converting {filepath} to WAV using {ffmpeg_exe}")
        result = subprocess.run(
            [ffmpeg_exe, "-y", "-i", filepath, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
            capture_output=True, timeout=30,
        )
        if result.returncode != 0:
            logger.error(f"ffmpeg conversion failed (rc={result.returncode}): {result.stderr.decode()[:500]}")
            return ""
        
        # Check WAV file size
        wav_size = os.path.getsize(wav_path) if os.path.exists(wav_path) else 0
        logger.info(f"Transcribe: WAV file size = {wav_size} bytes")
        if wav_size < 1000:
            logger.warning(f"Transcribe: WAV file too small ({wav_size} bytes), audio may be empty")
            return ""

        recognizer = sr.Recognizer()
        recognizer.energy_threshold = 300
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)

        # Map language codes for Google Speech Recognition
        speech_lang_map = {
            "he": "he-IL", "ar": "ar-SA", "ja": "ja-JP", "ko": "ko-KR",
            "zh-CN": "zh-CN", "zh-TW": "zh-TW", "hi": "hi-IN", "ru": "ru-RU",
            "de": "de-DE", "fr": "fr-FR", "es": "es-ES", "pt": "pt-BR",
            "it": "it-IT", "tr": "tr-TR", "nl": "nl-NL", "pl": "pl-PL",
            "uk": "uk-UA", "el": "el-GR", "th": "th-TH", "vi": "vi-VN",
            "id": "id-ID", "ms": "ms-MY", "sv": "sv-SE", "da": "da-DK",
            "no": "nb-NO", "fi": "fi-FI", "cs": "cs-CZ", "ro": "ro-RO",
            "hu": "hu-HU", "bg": "bg-BG", "hr": "hr-HR", "sk": "sk-SK",
            "fa": "fa-IR", "ta": "ta-IN", "te": "te-IN", "bn": "bn-IN",
            "ur": "ur-PK", "en": "en-US",
        }
        lang_code = speech_lang_map.get(source_lang, source_lang)
        logger.info(f"Transcribe: attempting recognition with lang={lang_code}")

        try:
            text = recognizer.recognize_google(audio_data, language=lang_code)
            logger.info(f"Transcribed audio ({source_lang}/{lang_code}): {text[:200]}")
            return text
        except sr.UnknownValueError:
            # If primary language fails, try with auto-detect / en-US as fallback
            if lang_code != "en-US":
                logger.warning(f"Transcription failed with {lang_code}, retrying with en-US fallback")
                try:
                    text = recognizer.recognize_google(audio_data, language="en-US")
                    logger.info(f"Transcribed audio (fallback en-US): {text[:200]}")
                    return text
                except sr.UnknownValueError:
                    logger.warning("Fallback en-US transcription also failed")
                    return ""
            return ""
    except sr.RequestError as e:
        logger.error(f"Speech recognition service error: {e}")
        return ""
    except Exception as e:
        logger.error(f"Transcription error: {type(e).__name__}: {e}")
        return ""
    finally:
        # Clean up converted WAV file
        if wav_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except OSError:
                pass


def get_supported_languages() -> dict:
    """Return dictionary of supported languages."""
    return SUPPORTED_LANGUAGES
