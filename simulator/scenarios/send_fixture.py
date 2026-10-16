"""Send a JSONL fixture to SentinelX ingestion API (demo only, lab IPs)."""
import json, sys, urllib.request

API = "http://localhost:8080/api/v1"

def login(email, password):
    req = urllib.request.Request(API + "/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)["token"]

def send(token, path, source_id="source-demo-01"):
    events = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    body = json.dumps({"source_id": source_id, "events": events}).encode()
    req = urllib.request.Request(API + "/ingest/events", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        print(r.status, r.read().decode()[:1000])

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("usage: send_fixture.py <email> <password> <fixture.jsonl> [source_id]")
        sys.exit(2)
    tok = login(sys.argv[1], sys.argv[2])
    send(tok, sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "source-demo-01")
