#!/usr/bin/env python3
"""
Production Server Launcher for Outbound Calling & Dialer Platform.
Loads the Cython-compiled application package.
"""
import os
import uvicorn

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WORKERS", "1"))
    log_level = os.getenv("LOG_LEVEL", "info")
    print(f"🚀 Starting Outbound Calling Platform on {host}:{port} (workers={workers})...")
    uvicorn.run("app.main:app", host=host, port=port, workers=workers, log_level=log_level)
