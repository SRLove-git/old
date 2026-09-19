import json

p = "/opt/suiyueli-old/server/data.json"
d = json.load(open(p, encoding="utf-8"))

if "assistant" not in d.get("config", {}):
    d.setdefault("config", {})["assistant"] = {
        "name": "小助理",
        "wechat": "suiyueli6070",
        "phone": "400-800-6070",
        "avatar": "🧑‍💼",
        "intro": "报名咨询、活动群、售后都可以找我",
    }

json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("assistant:", d["config"]["assistant"])
