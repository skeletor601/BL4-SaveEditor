"""Check a YouTube video for Maxroll/Mobalytics planner links in its description."""
import sys, re, json, urllib.request

sys.stdout.reconfigure(encoding='utf-8')

video_id = sys.argv[1] if len(sys.argv) > 1 else ""
if not video_id:
    print(json.dumps({"error": "video_id required"}))
    sys.exit(1)

try:
    import http.cookiejar, os
    cookie_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "yt_cookies.txt")
    opener = urllib.request.build_opener()
    if os.path.exists(cookie_path):
        cj = http.cookiejar.MozillaCookieJar(cookie_path)
        cj.load(ignore_discard=True, ignore_expires=True)
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    req = urllib.request.Request(
        f"https://www.youtube.com/watch?v={video_id}",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    html = opener.open(req, timeout=10).read().decode("utf-8", errors="ignore")

    # Title
    title_match = re.search(r'"title":"(.*?)"', html)
    title = title_match.group(1) if title_match else ""

    # Description
    desc_match = re.search(r'"shortDescription":"(.*?)"', html)
    desc = desc_match.group(1).replace("\\n", "\n") if desc_match else ""

    # Find planner links
    planner_links = []
    for m in re.finditer(r'https?://(?:www\.)?maxroll\.gg/borderlands-4/planner/[a-zA-Z0-9]+', desc):
        planner_links.append(m.group(0))
    for m in re.finditer(r'https?://(?:www\.)?mobalytics\.gg/borderlands-4/builds/[^\s"\\]+', desc):
        url = m.group(0).rstrip(".,;!)")
        planner_links.append(url)

    # Dedupe
    planner_links = list(dict.fromkeys(planner_links))

    # Check if captions exist
    has_transcript = '"captionTracks":[' in html

    print(json.dumps({
        "title": title,
        "plannerLinks": planner_links,
        "hasTranscript": has_transcript,
    }))

except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
