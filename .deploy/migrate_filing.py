import json

p = "/opt/suiyueli-old/server/data.json"
d = json.load(open(p, encoding="utf-8"))

if "filing" not in d.get("config", {}):
    d.setdefault("config", {})["filing"] = {
        "companyName": "北京岁悦里科技有限公司",
        "icp": "京ICP备2025001234号-1",
        "police": "",
    }

json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("filing:", d["config"]["filing"])
