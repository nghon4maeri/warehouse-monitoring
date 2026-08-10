"""
YouTube Transcript Extractor via yt-dlp + TimedText API.

Cách lấy cookies.txt:
  1. Cài "Get cookies.txt LOCALLY" trên Chrome
  2. Vào youtube.com, đăng nhập
  3. Export -> cookies.txt, upload lên Kaggle

Usage: python extract_transcript.py
"""

import http.cookiejar
import json
import random
import re
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yt_dlp

# ================================================================
# CONFIG
# ================================================================

INPUT_DIR = Path("/kaggle/input/datasets/namnguynnnn/media-info/media-info")
OUTPUT_DIR = Path("/kaggle/working/transcripts")
COOKIES_PATH = Path("/kaggle/input/datasets/namnguynnnn/cookies/cookies.txt")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Rate limit
MIN_DELAY = 5.0
MAX_JITTER = 5.0
BATCH_SIZE = 30
BATCH_BREAK_MIN = 120.0
BATCH_BREAK_MAX = 300.0
IP_BLOCK_COOLDOWN = 600.0
IP_BLOCK_MAX_RETRIES = 3
MAX_RETRIES = 3

last_request_time = 0.0
successive_successes = 0
ip_block_count = 0
stats = {
    "success": 0, "no_transcript": 0, "ip_blocked": 0,
    "rate_limited": 0, "video_unavailable": 0, "errors": 0, "skipped": 0,
}


def wait_for_rate_limit():
    global last_request_time
    now = time.monotonic()
    elapsed = now - last_request_time
    delay = MIN_DELAY + random.uniform(0, MAX_JITTER)
    if elapsed < delay:
        sleep_time = delay - elapsed
        print(f"[RATE LIMIT] Sleeping {sleep_time:.1f}s...")
        time.sleep(sleep_time)
    last_request_time = time.monotonic()


def batch_break_if_needed():
    global successive_successes
    if successive_successes >= BATCH_SIZE:
        break_time = random.uniform(BATCH_BREAK_MIN, BATCH_BREAK_MAX)
        print(f"\n[BATCH BREAK] {successive_successes} videos done. Break {break_time/60:.1f} min...")
        time.sleep(break_time)
        successive_successes = 0
        print("[BATCH BREAK] Resuming...")


def extract_video_id(url):
    if not url:
        return None
    url = url.strip()
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if hostname in ("youtube.com", "www.youtube.com"):
            query = parse_qs(parsed.query)
            if "v" in query:
                return query["v"][0]
            m = re.search(r"/(?:shorts|embed)/([^/?]+)", parsed.path)
            if m:
                return m.group(1)
        if hostname in ("youtu.be", "www.youtu.be"):
            return parsed.path.strip("/").split("/")[0]
    except Exception:
        pass
    return None


# ================================================================
# PARSE VTT
# ================================================================

def parse_vtt_to_segments(vtt_text):
    segments = []
    lines = vtt_text.strip().split("\n")
    i = 0
    while i < len(lines) and not re.match(r"^\d{2}:", lines[i].strip()):
        i += 1

    current_start = None
    current_duration = None
    current_text = []

    while i < len(lines):
        line = lines[i].strip()
        if not line:
            if current_start is not None and current_text:
                segments.append({
                    "text": " ".join(current_text).strip(),
                    "start": current_start,
                    "duration": current_duration,
                })
                current_start = None
                current_duration = None
                current_text = []
            i += 1
            continue

        ts_match = re.match(r"(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})", line)
        if ts_match:
            current_start = _ts_to_seconds(ts_match.group(1))
            end = _ts_to_seconds(ts_match.group(2))
            current_duration = end - current_start
            i += 1
            continue

        if current_start is not None:
            clean = re.sub(r"<[^>]+>", "", line).strip()
            if clean:
                current_text.append(clean)
        i += 1

    if current_start is not None and current_text:
        segments.append({
            "text": " ".join(current_text).strip(),
            "start": current_start,
            "duration": current_duration,
        })
    return segments


def _ts_to_seconds(ts):
    ts = ts.replace(",", ".")
    h, m, s = ts.split(":")
    return float(h) * 3600 + float(m) * 60 + float(s)


# ================================================================
# FETCH TRANSCRIPT
# ================================================================

def _load_cookiejar():
    cj = http.cookiejar.MozillaCookieJar()
    if COOKIES_PATH.exists():
        try:
            cj.load(str(COOKIES_PATH), ignore_discard=True, ignore_expires=True)
        except Exception:
            pass
    return cj


def _download_vtt(vtt_url):
    req = urllib.request.Request(vtt_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    })
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_load_cookiejar()))
    with opener.open(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def get_transcript_ytdlp(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"

    # Validate video exists (extract_flat=True = no format processing)
    ydl_opts = {"quiet": True, "no_warnings": True, "extract_flat": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        if "Video unavailable" in msg or "Private video" in msg or "not available" in msg:
            return {"status": "video_unavailable", "error": msg, "segments": []}
        if "HTTP Error 429" in msg or "Too Many Requests" in msg:
            return {"status": "rate_limited", "error": msg, "segments": []}
        if "Sign in to confirm" in msg or "bot" in msg.lower():
            return {"status": "ip_blocked", "error": msg, "segments": []}
        return {"status": "error", "error": msg, "segments": []}

    # Try subtitles via YouTube TimedText API (no format needed)
    for lang in ["vi", "en"]:
        # Manual
        try:
            vtt = _download_vtt(f"https://www.youtube.com/api/timedtext?v={video_id}&lang={lang}&fmt=vtt")
            if vtt.strip() and "WEBVTT" in vtt[:100]:
                segs = parse_vtt_to_segments(vtt)
                if segs:
                    print(f"[SUCCESS] {video_id}  manual-{lang}  segments={len(segs)}")
                    return {"status": "success", "segments": segs}
        except Exception:
            pass
        # Auto
        try:
            vtt = _download_vtt(f"https://www.youtube.com/api/timedtext?v={video_id}&lang={lang}&kind=asr&fmt=vtt")
            if vtt.strip() and "WEBVTT" in vtt[:100]:
                segs = parse_vtt_to_segments(vtt)
                if segs:
                    print(f"[SUCCESS] {video_id}  auto-{lang}  segments={len(segs)}")
                    return {"status": "success", "segments": segs}
        except Exception:
            pass

    return {"status": "no_transcript", "error": "No subtitles via TimedText API", "segments": []}


# ================================================================
# PROCESS ONE JSON
# ================================================================

def process_json(json_path):
    global successive_successes, ip_block_count

    print(f"\n{'='*80}")
    print(f"Processing: {json_path.name}")

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[JSON ERROR] {e}")
        return {"source_file": json_path.name, "transcript_status": "json_error", "error": str(e)}

    watch_url = data.get("watch_url")
    if not watch_url:
        print("[SKIP] watch_url missing")
        return {"source_file": json_path.name, "transcript_status": "missing_url"}

    video_id = extract_video_id(watch_url)
    if not video_id:
        print(f"[SKIP] Invalid URL: {watch_url}")
        return {"source_file": json_path.name, "watch_url": watch_url, "transcript_status": "invalid_url"}

    print(f"Video ID: {video_id}")
    print(f"Title   : {data.get('title', '')}")

    output_file = OUTPUT_DIR / f"{video_id}.json"
    if output_file.exists():
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
            prev_status = existing.get("transcript_status")
            if prev_status in ("success", "no_transcript", "video_unavailable"):
                print(f"[CHECKPOINT] Already processed ({prev_status}). Skipping.")
                stats["skipped"] += 1
                return existing
            print("[CHECKPOINT] Previous result was retryable. Reprocessing...")
        except Exception:
            print("[CHECKPOINT ERROR] Reprocessing...")

    for attempt in range(MAX_RETRIES):
        if attempt > 0:
            wait_time = 30 * (2 ** attempt) + random.uniform(0, 15)
            print(f"[RETRY {attempt + 1}/{MAX_RETRIES}] Waiting {wait_time:.0f}s...")
            time.sleep(wait_time)

        wait_for_rate_limit()
        batch_break_if_needed()

        print(f"[REQUEST] {video_id} (attempt {attempt + 1}/{MAX_RETRIES})")
        result = get_transcript_ytdlp(video_id)

        status = result["status"]
        if status == "success":
            break
        if status in ("no_transcript", "video_unavailable"):
            break
        if status == "ip_blocked":
            break

    output = {
        "source_file": json_path.name,
        "video_id": video_id,
        "watch_url": watch_url,
        "title": data.get("title"),
        "author": data.get("author"),
        "channel_id": data.get("channel_id"),
        "channel_url": data.get("channel_url"),
        "publish_date": data.get("publish_date"),
        "length": data.get("length"),
        "keywords": data.get("keywords", []),
        "transcript_status": result.get("status"),
        "transcript_error": result.get("error"),
        "transcript": result.get("segments", []),
    }

    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"[SAVED] {output_file}")
    except Exception as e:
        print(f"[SAVE ERROR] {e}")

    status = result["status"]
    if status == "success":
        stats["success"] += 1
        successive_successes += 1
    elif status == "ip_blocked":
        stats["ip_blocked"] += 1
        ip_block_count += 1
    elif status == "no_transcript":
        stats["no_transcript"] += 1
    elif status == "rate_limited":
        stats["rate_limited"] += 1
    elif status == "video_unavailable":
        stats["video_unavailable"] += 1
    else:
        stats["errors"] += 1

    return output


# ================================================================
# MAIN
# ================================================================

def main():
    global ip_block_count, successive_successes

    print("=" * 80)
    print("SCANNING DATASET")
    print("=" * 80)
    print(f"Input   : {INPUT_DIR}")
    print(f"Output  : {OUTPUT_DIR}")
    print(f"Cookies : {'FOUND' if COOKIES_PATH.exists() else 'NOT FOUND'}")
    print(f"Engine  : yt-dlp + TimedText API")

    if not INPUT_DIR.exists():
        print(f"\n[FATAL] Input not found: {INPUT_DIR}")
        sys.exit(1)

    json_files = sorted(INPUT_DIR.glob("*.json"))
    print(f"Found   : {len(json_files)} JSON files")
    print("=" * 80)

    if not json_files:
        print("No JSON files found. Exiting.")
        return

    results = []
    stopped_by_block = False

    for index, json_path in enumerate(json_files, start=1):
        print(f"\n[{index}/{len(json_files)}]")

        try:
            result = process_json(json_path)
            results.append(result)

            if result.get("transcript_status") == "ip_blocked":
                if ip_block_count < IP_BLOCK_MAX_RETRIES:
                    cooldown = IP_BLOCK_COOLDOWN + random.uniform(0, 120)
                    print()
                    print("=" * 80)
                    print(f"[IP BLOCKED #{ip_block_count}/{IP_BLOCK_MAX_RETRIES}]")
                    print(f"Waiting {cooldown/60:.0f} min before retrying...")
                    print("=" * 80)
                    time.sleep(cooldown)
                    result_retry = process_json(json_path)
                    results[-1] = result_retry
                    if result_retry.get("transcript_status") != "ip_blocked":
                        ip_block_count = 0
                    else:
                        stopped_by_block = True
                        break
                else:
                    print("\n" + "=" * 80)
                    print("YOUTUBE IP BLOCK - MAX RETRIES EXCEEDED")
                    print("Stopped. Files preserved.")
                    print("=" * 80)
                    stopped_by_block = True
                    break

        except KeyboardInterrupt:
            print("\n[STOP] Interrupted.")
            break
        except Exception as e:
            print(f"[UNEXPECTED ERROR] {json_path.name}: {e}")
            results.append({"source_file": json_path.name, "transcript_status": "unexpected_error", "error": str(e)})
            stats["errors"] += 1

    master_file = OUTPUT_DIR / "all_transcripts.json"
    with open(master_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    summary = {
        "total_processed": len(results), **stats,
        "stopped_by_ip_block": stopped_by_block,
        "input_directory": str(INPUT_DIR),
        "output_directory": str(OUTPUT_DIR),
        "cookies_used": COOKIES_PATH.exists(),
        "engine": "yt-dlp + TimedText API",
    }
    summary_file = OUTPUT_DIR / "summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 80)
    print("FINISHED")
    print("=" * 80)
    print(f"Processed         : {len(results)}")
    print(f"Success           : {stats['success']}")
    print(f"No transcript     : {stats['no_transcript']}")
    print(f"IP blocked        : {stats['ip_blocked']}")
    print(f"Rate limited      : {stats['rate_limited']}")
    print(f"Video unavailable : {stats['video_unavailable']}")
    print(f"Errors            : {stats['errors']}")
    print(f"Skipped (resume)  : {stats['skipped']}")
    print(f"Stopped by block  : {stopped_by_block}")
    print()
    print(f"Output            : {OUTPUT_DIR}")
    print(f"Master            : {master_file}")
    print(f"Summary           : {summary_file}")
    print("=" * 80)


if __name__ == "__main__":
    main()
