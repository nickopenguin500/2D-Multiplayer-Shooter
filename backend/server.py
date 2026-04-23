import asyncio
import websockets
import json
import math
import random
import uuid
import os
import time

ARENA_SIZE = 2000

state = {
    "players": {},
    "bullets": [],
    "zombies": [],
    "trees": [],
    "items": [],
    "loot_boxes": [], 
    "damage_indicators": []
}
connected_clients = {}

RARITY_CHOICES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"]
RARITY_WEIGHTS_CRATE = [70, 20, 8, 1.8, 0.2, 0.0]
RARITY_WEIGHTS_CHEST = [10, 30, 40, 15, 4, 1.0]

RARITY_MULTIPLIERS = {
    "common": 1.0, "uncommon": 1.2, "rare": 1.5,
    "epic": 1.8, "legendary": 2.2, "mythic": 2.8
}

def spawn_trees():
    for _ in range(30):
        while True:
            tx, ty = random.uniform(100, ARENA_SIZE-100), random.uniform(100, ARENA_SIZE-100)
            tr = random.uniform(30, 60)
            if math.hypot(tx - 1000, ty - 1000) > tr + 150:
                state["trees"].append({"x": tx, "y": ty, "radius": tr})
                break

def spawn_loot():
    for _ in range(15):
        state["loot_boxes"].append({"id": str(uuid.uuid4()), "x": random.uniform(100, 1900), "y": random.uniform(100, 1900), "type": "crate", "radius": 20})
    for _ in range(5):
        state["loot_boxes"].append({"id": str(uuid.uuid4()), "x": random.uniform(100, 1900), "y": random.uniform(100, 1900), "type": "chest", "radius": 25})

spawn_trees()
spawn_loot()

async def loot_spawner():
    while True:
        await asyncio.sleep(10)
        crates = sum(1 for b in state["loot_boxes"] if b["type"] == "crate")
        chests = sum(1 for b in state["loot_boxes"] if b["type"] == "chest")
        
        if crates < 15 or chests < 5:
            valid = False
            for _ in range(10):
                tx = random.uniform(100, ARENA_SIZE-100)
                ty = random.uniform(100, ARENA_SIZE-100)
                too_close = False
                for p in state["players"].values():
                    if math.hypot(p["x"] - tx, p["y"] - ty) < 400:
                        too_close = True
                        break
                if not too_close:
                    valid = True
                    break
            
            if valid:
                if crates < 15:
                    state["loot_boxes"].append({"id": str(uuid.uuid4()), "x": tx, "y": ty, "type": "crate", "radius": 20})
                elif chests < 5:
                    state["loot_boxes"].append({"id": str(uuid.uuid4()), "x": tx, "y": ty, "type": "chest", "radius": 25})

async def game_loop():
    while True:
        current_time = time.time()
        state["damage_indicators"] = [d for d in state["damage_indicators"] if d["expires"] > current_time]
        dead_players = []

        for b in state["bullets"][:]:
            steps = 3 if math.hypot(b["vx"], b["vy"]) > 25 else 1
            hit_something = False
            
            for _ in range(steps):
                if hit_something: break
                b["x"] += b["vx"] / steps
                b["y"] += b["vy"] / steps

                for t in state["trees"]:
                    if math.hypot(b["x"] - t["x"], b["y"] - t["y"]) < b["radius"] + t["radius"]:
                        if b in state["bullets"]: state["bullets"].remove(b)
                        hit_something = True; break
                if hit_something: break

                for pid, p in state["players"].items():
                    if pid != b["ownerId"] and math.hypot(b["x"] - p["x"], b["y"] - p["y"]) < b["radius"] + p["radius"]:
                        dmg = b["damage"]
                        state["damage_indicators"].append({"x": p["x"], "y": p["y"], "dmg": dmg, "expires": current_time + 0.5, "color": "#e74c3c"})
                        if p["shields"] >= dmg: p["shields"] -= dmg
                        else: p["health"] -= (dmg - p["shields"]); p["shields"] = 0
                        if b in state["bullets"]: state["bullets"].remove(b)
                        hit_something = True
                        
                        if p["health"] <= 0 and pid not in dead_players:
                            dead_players.append(pid)
                            # --- UPDATED: STEAL SCORE ON KILL ---
                            if b["ownerId"] in state["players"]: 
                                state["players"][b["ownerId"]]["score"] += p["score"] + 100
                        break
                if hit_something: break

                for z in state["zombies"][:]:
                    if math.hypot(b["x"] - z["x"], b["y"] - z["y"]) < b["radius"] + z["radius"]:
                        z["health"] -= b["damage"]
                        state["damage_indicators"].append({"x": z["x"], "y": z["y"], "dmg": b["damage"], "expires": current_time + 0.5, "color": "#FFF"})
                        if b in state["bullets"]: state["bullets"].remove(b)
                        hit_something = True
                        if z["health"] <= 0:
                            if z in state["zombies"]: state["zombies"].remove(z)
                            pts = 30 if z["type"] == "tank" else (5 if z["type"] == "runner" else 10)
                            if b["ownerId"] in state["players"]: state["players"][b["ownerId"]]["score"] += pts
                        break
            
            if not hit_something and not (0 <= b["x"] <= ARENA_SIZE and 0 <= b["y"] <= ARENA_SIZE):
                if b in state["bullets"]: state["bullets"].remove(b)

        player_ids = list(state["players"].keys())
        for z in state["zombies"][:]:
            if player_ids:
                target = state["players"][min(player_ids, key=lambda pid: math.hypot(state["players"][pid]["x"] - z["x"], state["players"][pid]["y"] - z["y"]))]
                angle = math.atan2(target["y"] - z["y"], target["x"] - z["x"])
                z["angle"] = angle
                z["x"] += math.cos(angle) * z["speed"]
                z["y"] += math.sin(angle) * z["speed"]

                for t in state["trees"]:
                    d = math.hypot(z["x"] - t["x"], z["y"] - t["y"])
                    if d < z["radius"] + t["radius"]:
                        overlap = (z["radius"] + t["radius"]) - d
                        pa = math.atan2(z["y"] - t["y"], z["x"] - t["x"])
                        z["x"] += math.cos(pa) * overlap; z["y"] += math.sin(pa) * overlap

            for pid, p in state["players"].items():
                if math.hypot(z["x"] - p["x"], z["y"] - p["y"]) < z["radius"] + p["radius"]:
                    if current_time > p["iframeUntil"]:
                        dmg = 25 if z["type"] == "tank" else (5 if z["type"] == "runner" else 10)
                        state["damage_indicators"].append({"x": p["x"], "y": p["y"], "dmg": dmg, "expires": current_time + 0.5, "color": "#e74c3c"})
                        if p["shields"] >= dmg: p["shields"] -= dmg
                        else: p["health"] -= (dmg - p["shields"]); p["shields"] = 0
                        p["iframeUntil"] = current_time + 1.0
                        if p["health"] <= 0 and pid not in dead_players:
                            dead_players.append(pid)

        for pid in dead_players:
            if pid in state["players"]:
                p = state["players"][pid]
                final_score = p["score"] # Save score before deleting player
                weps = p.get("weapons", [])
                rars = p.get("rarities", [])
                counts = p.get("counts", [])
                
                for i in range(len(weps)):
                    w = weps[i]
                    r = rars[i]
                    c = counts[i] if i < len(counts) else 1
                    if w and w != "fists":
                        ang = random.uniform(0, math.pi * 2)
                        dist = random.uniform(30, 80)
                        state["items"].append({
                            "id": str(uuid.uuid4()), "x": p["x"] + math.cos(ang)*dist, "y": p["y"] + math.sin(ang)*dist,
                            "type": w, "rarity": r, "radius": 15, "count": c
                        })
                
                ws = connected_clients.get(pid)
                # --- UPDATED: Send final score back to the client ---
                if ws: asyncio.create_task(ws.send(json.dumps({"type": "dead", "score": final_score})))
                del state["players"][pid]

        if connected_clients:
            msg = json.dumps({"type": "state", "data": state, "time": current_time})
            for ws in list(connected_clients.values()):
                asyncio.create_task(ws.send(msg))
                
        await asyncio.sleep(1/30)

async def handler(websocket):
    cid = str(uuid.uuid4())
    connected_clients[cid] = websocket
    await websocket.send(json.dumps({"type": "init", "id": cid}))
    
    try:
        async for message in websocket:
            data = json.loads(message)
            
            if data["type"] == "spawn":
                raw_name = data.get("name", "Player")
                clean_name = "".join(c for c in raw_name if c.isalnum() or c == ' ')[:12]
                state["players"][cid] = {
                    "x": 1000, "y": 1000, "radius": 15, "color": f"hsl({random.randint(0,360)},100%,50%)", 
                    "score": 0, "health": 100, "shields": 0, "iframeUntil": 0, "aimAngle": 0, 
                    "currentWeapon": "fists", "name": clean_name, "weapons": [], "rarities": [], "counts": []
                }
            
            elif data["type"] == "sync_inv":
                if cid in state["players"]:
                    state["players"][cid]["weapons"] = data.get("weapons", [])
                    state["players"][cid]["rarities"] = data.get("rarities", [])
                    state["players"][cid]["counts"] = data.get("counts", [])

            elif data["type"] == "move":
                if cid not in state["players"]: continue
                p = state["players"][cid]
                p["aimAngle"] = data["aimAngle"]
                p["currentWeapon"] = data.get("weapon", "fists")
                speed = 9.1 if p["currentWeapon"] == "fists" else 7.0
                dx, dy = (1 if data["right"] else 0) - (1 if data["left"] else 0), (1 if data["down"] else 0) - (1 if data["up"] else 0)
                if dx or dy:
                    mag = math.hypot(dx, dy)
                    p["x"] += (dx/mag)*speed; p["y"] += (dy/mag)*speed
                p["x"], p["y"] = max(0, min(ARENA_SIZE, p["x"])), max(0, min(ARENA_SIZE, p["y"]))
                for t in state["trees"]:
                    d = math.hypot(p["x"] - t["x"], p["y"] - t["y"])
                    if d < p["radius"] + t["radius"]:
                        overlap = (p["radius"] + t["radius"]) - d
                        pa = math.atan2(p["y"] - t["y"], p["x"] - t["x"])
                        p["x"] += math.cos(pa) * overlap; p["y"] += math.sin(pa) * overlap
            
            elif data["type"] == "interact":
                if cid not in state["players"]: continue
                p = state["players"][cid]
                interacted = False
                
                for box in state["loot_boxes"][:]:
                    if math.hypot(p["x"] - box["x"], p["y"] - box["y"]) < p["radius"] + box["radius"] + 20:
                        weights = RARITY_WEIGHTS_CHEST if box["type"] == "chest" else RARITY_WEIGHTS_CRATE
                        count = random.randint(2, 3) if box["type"] == "chest" else random.randint(1, 2)
                        
                        for _ in range(count):
                            typ = random.choice(["pistol", "ar", "shotgun", "sniper", "bandage", "medkit", "mini", "big"])
                            if typ in ["bandage", "medkit", "mini", "big"]:
                                r = {"bandage": "common", "medkit": "rare", "mini": "uncommon", "big": "rare"}[typ]
                                c = {"bandage": 5, "medkit": 1, "mini": 2, "big": 1}[typ]
                            else:
                                r = random.choices(RARITY_CHOICES, weights=weights)[0]
                                c = 1

                            state["items"].append({
                                "id": str(uuid.uuid4()), "x": box["x"] + random.uniform(-30, 30), "y": box["y"] + random.uniform(-30, 30),
                                "type": typ, "rarity": r, "count": c, "radius": 15
                            })
                            
                        state["loot_boxes"].remove(box)
                        interacted = True
                        break
                
                if not interacted:
                    for item in state["items"][:]:
                        if math.hypot(p["x"] - item["x"], p["y"] - item["y"]) < p["radius"] + item["radius"] + 25:
                            await websocket.send(json.dumps({"type": "pickup", "weapon": item["type"], "rarity": item["rarity"], "count": item.get("count", 1)}))
                            state["items"].remove(item)
                            break
            
            elif data["type"] == "drop":
                if cid not in state["players"]: continue
                state["items"].append({
                    "id": str(uuid.uuid4()), "x": state["players"][cid]["x"], "y": state["players"][cid]["y"], 
                    "type": data["weapon"], "rarity": data["rarity"], "count": data.get("count", 1), "radius": 15
                })
            
            elif data["type"] == "shoot":
                if cid not in state["players"]: continue
                p = state["players"][cid]; a = data["angle"]; w = data["weapon"]
                
                if w in ["bandage", "medkit", "mini", "big"]:
                    if w == "bandage" and p["health"] < 75: p["health"] = min(75, p["health"] + 15)
                    elif w == "medkit" and p["health"] < 100: p["health"] = min(100, p["health"] + 100)
                    elif w == "mini" and p["shields"] < 50: p["shields"] = min(50, p["shields"] + 25)
                    elif w == "big" and p["shields"] < 100: p["shields"] = min(100, p["shields"] + 50)
                else:
                    rarity = data.get("rarity", "common")
                    mult = RARITY_MULTIPLIERS.get(rarity, 1.0)
                    if w == "pistol": state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(a)*15, "vy": math.sin(a)*15, "ownerId": cid, "radius": 5, "damage": 10 * mult})
                    elif w == "ar": state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(a)*18, "vy": math.sin(a)*18, "ownerId": cid, "radius": 4, "damage": 5 * mult})
                    elif w == "shotgun":
                        pellet_count_map = {"common": 5, "uncommon": 6, "rare": 7, "epic": 8, "legendary": 10, "mythic": 12}
                        pellets = pellet_count_map.get(rarity, 5)
                        for _ in range(pellets):
                            sa = a + random.uniform(-0.25, 0.25); sp = random.uniform(12, 16)
                            state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(sa)*sp, "vy": math.sin(sa)*sp, "ownerId": cid, "radius": 3, "damage": 6})
                    elif w == "sniper": state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(a)*35, "vy": math.sin(a)*35, "ownerId": cid, "radius": 4, "damage": 50 * mult})

    except websockets.exceptions.ConnectionClosed: pass
    finally:
        if cid in connected_clients: del connected_clients[cid]
        if cid in state["players"]: del state["players"][cid]

async def spawner():
    while True:
        if len(state["zombies"]) < 15:
            zt = random.choices(["standard", "runner", "tank"], weights=[60, 30, 10])[0]
            if zt == "runner": r, s, h, c = 10, random.uniform(4.5, 6.0), 10, "#f39c12"
            elif zt == "tank": r, s, h, c = 35, random.uniform(0.8, 1.5), 100, "#2c3e50"
            else: r, s, h, c = 15, random.uniform(1.5, 3.0), 30, "#2ecc71"
            state["zombies"].append({"x": random.choice([0, 2000]), "y": random.uniform(0, 2000), "radius": r, "speed": s, "angle": 0, "health": h, "color": c, "type": zt})
        await asyncio.sleep(2)

async def main():
    asyncio.create_task(game_loop())
    asyncio.create_task(spawner())
    asyncio.create_task(loot_spawner())
    async with websockets.serve(handler, "0.0.0.0", int(os.environ.get("PORT", 8000))): await asyncio.Future()

if __name__ == "__main__": asyncio.run(main())