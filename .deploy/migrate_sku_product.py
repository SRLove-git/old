import json

p = "/opt/suiyueli-old/server/data.json"
d = json.load(open(p, encoding="utf-8"))

for a in d.get("activities", []):
    if not a.get("sellType"):
        a["sellType"] = "sku" if a.get("category") == 5 else "date"
    if a.get("sellType") == "sku":
        a["hasSku"] = True
        if not a.get("skus"):
            a["skus"] = [
                {"id": "sku-white", "name": "经典白 500ml", "price": 69, "memberPrice": 59, "hot": False},
                {"id": "sku-blue", "name": "星空蓝 500ml", "price": 69, "memberPrice": 59, "hot": True},
                {"id": "sku-pink", "name": "樱花粉 500ml", "price": 69, "memberPrice": 59, "hot": False},
            ]
        a["schedules"] = []

json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("migrated sellType for", len(d.get("activities", [])), "activities")
