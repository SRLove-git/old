import json

p = "/opt/suiyueli-old/server/data.json"
d = json.load(open(p, encoding="utf-8"))

# 主理人申请费用（后台可调）
d.setdefault("config", {})
if "managerApplyFee" not in d["config"]:
    d["config"]["managerApplyFee"] = 199

# 私域直播示例数据（如缺失则补入）
if not d.get("lives"):
    d["lives"] = [
        {
            "id": "live1",
            "title": "岁悦学堂 · 手机摄影直播课",
            "cover": "📷",
            "coverTone": "linear-gradient(135deg,#3b6fa0,#7fb3d5)",
            "hostName": "陈老师",
            "hostAvatar": "🧑‍🏫",
            "managerId": None,
            "status": "live",
            "startAt": "2026-09-19 19:30",
            "endAt": "2026-09-19 20:30",
            "streamUrl": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            "replayUrl": "",
            "description": "零基础手机摄影入门，直播手把手教学，可实时提问互动。",
            "activityId": 5,
            "viewers": 128,
            "createdAt": "2026-09-19 10:00"
        },
        {
            "id": "live2",
            "title": "主理人私域 · 秋季养生茶话会",
            "cover": "🍵",
            "coverTone": "linear-gradient(135deg,#2f7d5c,#7cc79a)",
            "hostName": "李秀兰",
            "hostAvatar": "👵",
            "managerId": 1001,
            "status": "scheduled",
            "startAt": "2026-09-20 15:00",
            "endAt": "2026-09-20 16:00",
            "streamUrl": "",
            "replayUrl": "",
            "description": "仅限李秀兰主理人的私域客户观看，分享秋季养生小知识。",
            "activityId": None,
            "viewers": 0,
            "createdAt": "2026-09-19 09:00"
        },
        {
            "id": "live3",
            "title": "大理研学行前说明会 · 回放",
            "cover": "🏔️",
            "coverTone": "linear-gradient(135deg,#2b6f9c,#8fc6e7)",
            "hostName": "王建国",
            "hostAvatar": "👴",
            "managerId": None,
            "status": "ended",
            "startAt": "2026-09-18 19:00",
            "endAt": "2026-09-18 20:00",
            "streamUrl": "",
            "replayUrl": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            "description": "大理5日研学行前说明，讲解行程安排与注意事项。",
            "activityId": 3,
            "viewers": 86,
            "createdAt": "2026-09-18 15:00"
        }
    ]

json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("managerApplyFee:", d["config"].get("managerApplyFee"), "| lives:", len(d.get("lives", [])))
