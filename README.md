# AutoClip Web (AutoClip Studio)

AI-powered video clipping & TikTok UGC engine:
- FastAPI backend (`server.py`) on `:8005`
- React + Tailwind frontend (`frontend/`)
- Face-tracking 9:16 video renderer with custom captions (`chopify/`)
- Streamlit fallback UI (`app.py`)

## Quickstart

### 1. Requirements
- Python 3.10+
- FFmpeg installed and in PATH
- Node.js 18+ (for frontend development)

### 2. Backend Setup
```bash
python -m venv .venv
source .venv/bin/activate  # atau .venv\Scripts\activate di Windows
pip install -r requirements.txt
```

### 3. Run
Double-click `run.bat` or run:
```bash
uvicorn server:app --host 127.0.0.1 --port 8005
```
Open `http://127.0.0.1:8005`.
