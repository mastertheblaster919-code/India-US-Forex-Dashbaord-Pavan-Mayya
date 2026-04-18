import json
import os

def get_config():
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            return json.load(f)
    return {}

def get_backend_port():
    cfg = get_config()
    return cfg.get("backend", {}).get("port", 8000)

def get_backend_url():
    port = get_backend_port()
    return f"http://localhost:{port}/api"
