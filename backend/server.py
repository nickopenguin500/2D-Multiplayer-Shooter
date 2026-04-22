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
    "damage_indicators": [] 
}
connected_clients = set()

for _ in range(30):
    while True:
        tx = random.uniform(100, ARENA_SIZE - 100)
        ty = random.uniform(100, ARENA_SIZE - 100)
        tradius = random.uniform(30, 60)
        dist_to_center = math.hypot(tx - (ARENA_SIZE / 2), ty - (ARENA_SIZE / 2))
        if dist_to_center > tradius + 150:
            state["trees"].append({"x": tx, "y": ty, "radius": tradius})
            break 

async def game_loop():
    while True:
        current_time = time.time()
        
        state["damage_indicators"] = [d for d in state["damage_indicators"] if d["expires"] > current_time]

        for b in state["bullets"][:]:
            b["x"] += b["vx"]
            b["y"] += b["vy"]
            hit_something = False
            for t in state["trees"]:
                if math.hypot(b["x"] - t["x"], b["y"] - t["y"]) < b["radius"] + t["radius"]:
                    if b in state["bullets"]: state["bullets"].remove(b)
                    hit_something = True
                    break
            if not hit_something and not (0 <= b["x"] <= ARENA_SIZE and 0 <= b["y"] <= ARENA_SIZE):
                if b in state["bullets"]: state["bullets"].remove(b)

        player_ids = list(state["players"].keys())
        for z in state["zombies"][:]:
            if player_ids:
                nearest_id = min(player_ids, key=lambda pid: math.hypot(state["players"][pid]["x"] - z["x"], state["players"][pid]["y"] - z["y"]))
                target_p = state["players"][nearest_id]
                angle = math.atan2(target_p["y"] - z["y"], target_p["x"] - z["x"])
                z["angle"] = angle
                
                old_x, old_y = z["x"], z["y"]
                z["x"] += math.cos(angle) * z["speed"]
                z["y"] += math.sin(angle) * z["speed"]

                for t in state["trees"]:
                    if math.hypot(z["x"] - t["x"], z["y"] - t["y"]) < z["radius"] + t["radius"]:
                        z["x"], z["y"] = old_x, old_y 

            for pid, p in state["players"].items():
                if math.hypot(z["x"] - p["x"], z["y"] - p["y"]) < z["radius"] + p["radius"]:
                    if current_time > p["iframeUntil"]:
                        # Tanks do more damage, runners do less!
                        damage_taken = 25 if z.get("type") == "tank" else (5 if z.get("type") == "runner" else 10)
                        
                        state["damage_indicators"].append({
                            "x": p["x"], "y": p["y"], "dmg": damage_taken, "expires": current_time + 0.5, "color": "#e74c3c"
                        })
                        if p["shields"] >= damage_taken:
                            p["shields"] -= damage_taken
                        else:
                            overflow = damage_taken - p["shields"]
                            p["shields"] = 0
                            p["health"] -= overflow
                            
                        p["iframeUntil"] = current_time + 1.0 
                        if p["health"] <= 0:
                            p["health"] = 100
                            p["shields"] = 50 
                            p["x"], p["y"] = ARENA_SIZE / 2, ARENA_SIZE / 2
                            p["score"] = 0 

            for b in state["bullets"][:]:
                if math.hypot(b["x"] - z["x"], b["y"] - z["y"]) < b["radius"] + z["radius"]:
                    z["health"] -= b["damage"] 
                    state["damage_indicators"].append({
                        "x": z["x"], "y": z["y"], "dmg": b["damage"], "expires": current_time + 0.5, "color": "#FFF"
                    })
                    if b in state["bullets"]: state["bullets"].remove(b) 
                    if z["health"] <= 0: 
                        if z in state["zombies"]: state["zombies"].remove(z)
                        
                        # Award points based on zombie type
                        points = 30 if z.get("type") == "tank" else (5 if z.get("type") == "runner" else 10)
                        if b["ownerId"] in state["players"]:
                            state["players"][b["ownerId"]]["score"] += points
                    break 

        if connected_clients:
            message = json.dumps({"type": "state", "data": state, "time": current_time})
            websockets.broadcast(connected_clients, message)
        
        await asyncio.sleep(1/30)

async def spawner():
    while True:
        if len(state["zombies"]) < 15: 
            # Weighted random choice: 60% standard, 30% runner, 10% tank
            z_type = random.choices(["standard", "runner", "tank"], weights=[60, 30, 10])[0]
            
            if z_type == "runner":
                z_radius = 10
                z_speed = random.uniform(4.5, 6.0)
                z_health = 10
                z_color = "#f39c12" # Orange
            elif z_type == "tank":
                z_radius = 35
                z_speed = random.uniform(0.8, 1.5)
                z_health = 100
                z_color = "#2c3e50" # Dark Grey
            else:
                z_radius = 15
                z_speed = random.uniform(1.5, 3.0)
                z_health = 30
                z_color = "#2ecc71" # Normal Green

            state["zombies"].append({
                "x": 0 if random.random() < 0.5 else ARENA_SIZE, "y": random.uniform(0, ARENA_SIZE),
                "radius": z_radius, "speed": z_speed, "angle": 0, "health": z_health, 
                "color": z_color, "type": z_type
            })
        await asyncio.sleep(2) # Spawns slightly faster now!

async def handler(websocket):
    client_id = str(uuid.uuid4())
    connected_clients.add(websocket)
    
    state["players"][client_id] = {
        "x": ARENA_SIZE / 2, "y": ARENA_SIZE / 2,
        "radius": 15, "color": f"hsl({random.randint(0, 360)}, 100%, 50%)", "score": 0,
        "health": 100, "shields": 50, 
        "iframeUntil": 0, "aimAngle": 0, 
        "currentWeapon": "fists" 
    }
    
    await websocket.send(json.dumps({"type": "init", "id": client_id}))
    
    try:
        async for message in websocket:
            data = json.loads(message)
            if data["type"] == "move":
                p = state["players"][client_id]
                old_x, old_y = p["x"], p["y"]
                p["aimAngle"] = data["aimAngle"] 
                p["currentWeapon"] = data.get("weapon", "fists") 
                
                speed = 7.8 if p["currentWeapon"] == "fists" else 6.0
                
                if data["up"]: p["y"] -= speed
                if data["down"]: p["y"] += speed
                if data["left"]: p["x"] -= speed
                if data["right"]: p["x"] += speed
                p["x"] = max(0, min(ARENA_SIZE, p["x"]))
                p["y"] = max(0, min(ARENA_SIZE, p["y"]))
                for t in state["trees"]:
                    if math.hypot(p["x"] - t["x"], p["y"] - t["y"]) < p["radius"] + t["radius"]:
                        p["x"], p["y"] = old_x, old_y 
            
            elif data["type"] == "shoot":
                angle = data["angle"]
                weapon = data["weapon"]
                p = state["players"][client_id]
                
                if weapon == "pistol":
                    state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(angle) * 15, "vy": math.sin(angle) * 15, "ownerId": client_id, "radius": 5, "damage": 10})
                elif weapon == "ar":
                    state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(angle) * 18, "vy": math.sin(angle) * 18, "ownerId": client_id, "radius": 4, "damage": 5})
                elif weapon == "shotgun":
                    for _ in range(5):
                        spread_angle = angle + random.uniform(-0.25, 0.25)
                        bullet_speed = random.uniform(12, 16)
                        state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(spread_angle) * bullet_speed, "vy": math.sin(spread_angle) * bullet_speed, "ownerId": client_id, "radius": 3, "damage": 6})
                elif weapon == "sniper":
                    state["bullets"].append({"x": p["x"], "y": p["y"], "vx": math.cos(angle) * 35, "vy": math.sin(angle) * 35, "ownerId": client_id, "radius": 8, "damage": 50})
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.remove(websocket)
        if client_id in state["players"]: del state["players"][client_id]

async def main():
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}...")
    asyncio.create_task(game_loop())
    asyncio.create_task(spawner()) 
    async with websockets.serve(handler, "0.0.0.0", port):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())