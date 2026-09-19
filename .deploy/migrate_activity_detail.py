import json

p = "/opt/suiyueli-old/server/data.json"
d = json.load(open(p, encoding="utf-8"))

for a in d.get("activities", []):
    if "managerId" not in a:
        a["managerId"] = 1001 if int(a.get("id", 99)) <= 4 else 1002
    if not a.get("detailBlocks"):
        a["detailBlocks"] = [
            {"type": "text", "text": a.get("detail", "")},
            {"type": "image", "emoji": a.get("cover", "📌"), "tone": a.get("coverTone", ""), "caption": "活动实景"},
            {"type": "image", "emoji": "🏞️", "tone": a.get("coverTone", ""), "caption": "行程/环境展示"},
            {"type": "video", "emoji": "🎬", "tone": a.get("coverTone", ""), "caption": "活动视频", "url": ""},
        ]

json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("migrated", len(d.get("activities", [])), "activities")
