import asyncio
from fastapi.testclient import TestClient
from main import app

def test_chat():
    with TestClient(app) as client:
        response = client.post(
            "/chat",
            json={"question": "What does the user service do?", "project_id": "default"}
        )
        with open("test_result.txt", "w", encoding="utf-8") as f:
            f.write(f"Status: {response.status_code}\n")
            try:
                f.write(f"Response: {response.json()}\n")
            except:
                f.write(f"Raw: {response.text}\n")

if __name__ == "__main__":
    test_chat()
