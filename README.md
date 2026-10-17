# Outbound Calling & Dialer Platform (Binary Release)

High-performance AI Outbound Dialer and Real-time Asterisk ARI Telephony Engine.

## Quick Start on VM

### 1. Requirements
- Python 3.14 (or compatible CPython runtime on Linux x86_64)
- Virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
nano .env  # Fill in your Asterisk ARI credentials and database URL
```

### 3. Create Superuser (Optional)
```bash
python create_superuser.py --email admin@example.com --password StrongPassword123
```

### 4. Run Server
```bash
# Direct run:
python run.py

# Or via Uvicorn:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Access the dashboard at `http://<VM_IP>:8000/`.
