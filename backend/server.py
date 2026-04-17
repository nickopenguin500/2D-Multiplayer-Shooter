import asyncio
import websockets
import json
import math
import random
import uuid
import os
import time # New import for tracking i-frames

ARENA_SIZE = 2000

# Game State
state = {
    "players": {},
    "bullets": [],
    "zombies": [],
    "trees": [] 
}
connected_clients = set()

# Generate random trees
for _ in range(30):
    state["trees"].append({
        "x": random.uniform(100, ARENA_SIZE - 100),
        "y": random.uniform(100, ARENA_SIZE - 100),
        "radius": random.uniform(30, 60)
    })

# Game loop functions
async def game_loop():
    while True:
        # 1. Move Bullets
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

        # 2. Move Zombies & Check Collisions
        current_time = time.time()
        player_ids = list(state["players"].keys())
        for z in state["zombies"][:]:
            target_p = None
            if player_ids:
                nearest_id = min(player_ids, key=lambda pid: math.hypot(state["players"][pid]["x"] - z["x"], state["players"][pid]["y"] - z["y"]))
                target_p = state["players"][nearest_id]
                angle = math.atan2(target_p["y"] - z["y"], target_p["x"] - z["x"])
                z["angle"] = angle # Save angle for drawing eyes
                
                old_x, old_y = z["x"], z["y"]
                z["x"] += math.cos(angle) * z["speed"]
                z["y"] += math.sin(angle) * z["speed"]

                for t in state["trees"]:
                    if math.hypot(z["x"] - t["x"], z["y"] - t["y"]) < z["radius"] + t["radius"]:
                        z["x"], z["y"] = old_x, old_y 

            # NEW: Zombie vs Player Damage logic
            for pid, p in state["players"].items():
                if math.hypot(z["x"] - p["x"], z["y"] - p["y"]) < z["radius"] + p["radius"]:
                    # Check if player is invincible
                    if current_time > p["iframeUntil"]:
                        p["health"] -= 10 # Take 10 damage
                        p["iframeUntil"] = current_time + 1.0 # 1 second of i-frames
                        
                        # Kill player logic
                        if p["health"] <= 0:
                            print(f"Player {pid} died.")
                            p["health"] = 100
                            p["x"] = ARENA_SIZE / 2
                            p["y"] = ARENA_SIZE / 2
                            p["score"] = 0 # Reset score or handle death differently

            # Bullet vs Zombie
            for b in state["bullets"][:]:
                if math.hypot(b["x"] - z["x"], b["y"] - z["y"]) < b["radius"] + z["radius"]:
                    if z in state["zombies"]: state["zombies"].remove(z)
                    if b in state["bullets"]: state["bullets"].remove(b)
                    if b["ownerId"] in state["players"]:
                        state["players"][b["ownerId"]]["score"] += 10
                    break

        # Broadcast state
        if connected_clients:
            message = json.dumps({"type": "state", "data": state, "time": current_time})
            websockets.broadcast(connected_clients, message)
        
        await asyncio.sleep(1/30)

# The Zombie Spawner (Make sure this task is running!)
async def spawner():
    print("Spawner started.")
    while True:
        # Spawn if less than 15 zombies
        if len(state["zombies"]) < 15: 
            state["zombies"].append({
                "x": 0 if random.random() < 0.5 else ARENA_SIZE,
                "y": random.uniform(0, ARENA_SIZE),
                "radius": 15,
                "speed": random.uniform(1.5, 3.0), # Varied speed
                "angle": 0 # Default angle
            })
        await asyncio.sleep(3) # Spawn check every 3 seconds

async def handler(websocket):
    client_id = str(uuid.uuid4())
    connected_clients.add(websocket)
    print(f"Player connected: {client_id}")
    
    # NEW: Player State (health, iframeUntil, aimAngle)
    state["players"][client_id] = {
        "x": ARENA_SIZE / 2, "y": ARENA_SIZE / 2,
        "radius": 15, "color": f"hsl({random.randint(0, 360)}, 100%, 50%)", "score": 0,
        "health": 100,
        "iframeUntil": 0,
        "aimAngle": 0
    }
    
    await websocket.send(json.dumps({"type": "init", "id": client_id}))
    
    try:
        async for message in websocket:
            data = json.loads(message)
            if data["type"] == "move":
                p = state["players"][client_id]
                old_x, old_y = p["x"], p["y"]
                p["aimAngle"] = data["aimAngle"] # Save aiming angle from client
                speed = 6 
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
                p = state["players"][client_id]
                state["bullets"].append({
                    "x": p["x"], "y": p["y"],
                    "vx": math.cos(angle) * 15, "vy": math.sin(angle) * 15, 
                    "ownerId": client_id, "radius": 5
                })
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.remove(websocket)
        if client_id in state["players"]: del state["players"][client_id]
        print(f"Player disconnected: {client_id}")

async def main():
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}...")
    # These create_task calls are CRITICAL to start the loops
    asyncio.create_task(game_loop())
    asyncio.create_task(spawner()) # New task
    async with websockets.serve(handler, "0.0.0.0", port):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())