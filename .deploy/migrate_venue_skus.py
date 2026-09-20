import json

p = "/opt/suiyueli-old/server/data.json"
d = json.load(open(p, encoding="utf-8"))

# 掼蛋活动：一个活动多个场地，用 SKU 区分区域，每个 SKU 带独立地址
for a in d.get("activities", []):
    aid = str(a.get("id"))
    if aid == "2" and (not a.get("skus") or a.get("hasSku") is False):
        a["hasSku"] = True
        a["skuLabel"] = "场地"
        a["address"] = "多个场地可选"
        a["title"] = "每周掼蛋交友局（多场地可选）"
        a["skus"] = [
            {"id": "gd-tianhe", "name": "天河场 · 每周六下午", "district": "天河",
             "address": "广州市天河区体育东路 116 号 · 幸福里棋牌室 2 楼",
             "price": 49, "memberPrice": 39, "hot": True},
            {"id": "gd-panyu", "name": "番禺场 · 每周日下午", "district": "番禺",
             "address": "广州市番禺区市桥光明北路 45 号 · 乐龄活动中心 1 楼",
             "price": 49, "memberPrice": 39, "hot": False},
            {"id": "gd-nansha", "name": "南沙场 · 每周五下午", "district": "南沙",
             "address": "广州市南沙区凤凰大道 88 号 · 社区文化站 3 楼",
             "price": 49, "memberPrice": 39, "hot": False},
        ]
        a["regionIds"] = ["tianhe", "panyu", "nansha"]
    if aid == "3" and not a.get("skuLabel"):
        a["skuLabel"] = "房型"
        for s in a.get("skus", []):
            if not s.get("address"):
                s["address"] = "大理古城南门游客中心集合"
    if a.get("skus") and not a.get("skuLabel") and aid not in ("2", "3"):
        a["skuLabel"] = "规格"

# 商品 SKU 称谓
for prod in d.get("products", []):
    if prod.get("skus") and not prod.get("skuLabel"):
        prod["skuLabel"] = "规格"

json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
act2 = next((a for a in d.get("activities", []) if str(a.get("id")) == "2"), {})
print("activity2 skus:", [s.get("name") for s in act2.get("skus", [])], "| skuLabel:", act2.get("skuLabel"))
