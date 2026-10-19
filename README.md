# Enterprise Outbound Telephony & AI Campaign Dispatcher
## Production Deployment, Asterisk PBX Setup & Operations Manual

This repository contains the hardened, production-ready binary distribution of the **Institutional Outbound Calling & Campaign Telephony Engine**. All core application logic has been compiled into optimized native C shared libraries (`.so`) for high performance, sub-millisecond execution, and intellectual property protection.

---

## Table of Contents
1. [Architecture & Network Flow](#1-architecture--network-flow)
2. [IT Provisioning Checklist (What to Request from IT)](#2-it-provisioning-checklist-what-to-request-from-it)
3. [Asterisk / FreePBX Server Configuration (Mandatory PBX Setup)](#3-asterisk--freepbx-server-configuration-mandatory-pbx-setup)
4. [Application VM Installation & Deployment](#4-application-vm-installation--deployment)
5. [Environment Configuration Reference (`.env`)](#5-environment-configuration-reference-env)
6. [Google Sheets Live Integration (Real-Time Lead Sync)](#6-google-sheets-live-integration-real-time-lead-sync)
7. [Systemd Production Daemon Setup (24/7 Auto-Start)](#7-systemd-production-daemon-setup-247-auto-start)
8. [Smoke Testing & Live Verification](#8-smoke-testing--live-verification)
9. [Operational Troubleshooting & Diagnostic Runbook](#9-operational-troubleshooting--diagnostic-runbook)

---

## 1. Architecture & Network Flow

```
[ Institutional Staff / Admins ]
              │  (Port 8000 Web UI / HTTPS)
              ▼
   ┌───────────────────────────────────────────────┐
   │             APPLICATION VM (Linux)            │
   │  FastAPI Telephony Daemon (Python 3.12 / 3.14)│
   │  - Campaign Queue & Scheduler Engine          │
   │  - SQLite / PostgreSQL Call Records Database  │
   │  - Static HTTP Audio Server (:8000)           │
   └───────▲───────────────────────────────┬───────┘
           │ WebSocket Events              │ ARI REST Requests
           │ (Stasis App)                  │ (Originate / Play)
           │                               │
           ▼                               ▼
   ┌───────────────────────────────────────────────┐
   │         FREEPBX / ASTERISK PBX SERVER         │
   │  - Asterisk REST Interface (ARI :8088)        │
   │  - Media Cache Subsystem (/var/cache/asterisk)│
   │  - SIP / PJSIP Extensions & Dynamic Channels  │
   └───────────────────────┬───────────────────────┘
                           │ SIP Signaling (:5060) & RTP Audio (:10000-20000)
                           ▼
              ┌─────────────────────────┐
              │  Telecom Carrier Trunk  │
              │  (Nayatel / PRI / E1)   │
              └────────────┬────────────┘
                           ▼
                  [ Candidate Handset ]
```

---

## 2. IT Provisioning Checklist (What to Request from IT)

Before deploying the application, the institutional IT and Telecom teams must provide the following infrastructure specifications and parameters:

### A. Application Server (VM)
- **Operating System:** Ubuntu 22.04 LTS or Ubuntu 24.04 LTS (x86_64 architecture).
- **Compute Sizing:** Minimum 2 vCPU, 4 GB RAM, 20 GB SSD storage.
- **Access Privileges:** Static LAN IP address, SSH credentials with `sudo` permissions.

### B. PBX & Telephony Parameters
- **Asterisk / FreePBX Server IP:** (e.g., `172.15.10.7`).
- **Asterisk Root / Sudo SSH Access:** Required once to initialize the `/var/cache/asterisk` media buffer.
- **ARI (Asterisk REST Interface) Credentials:**
  - ARI Username (e.g., `fastapi_bot`).
  - ARI Password.
  - Stasis Application Name (e.g., `outbound_announcer` or `uor_dialer`).
- **Extension Suite Allocations:** A block of internal SIP / PJSIP extensions (typically 5 to 10 lines, e.g., `16001` through `16010`) and their respective SIP secret passwords.
- **Outgoing DIDs (Caller IDs):** The public telephone numbers provisioned by the telecom carrier corresponding to the trunk extensions (e.g., `0415474001` to `0415474011`).
- **Trunk Name:** The outbound route name configured on FreePBX (e.g., `0415474001` or `NayatelTrunk`).

### C. Network & Firewall Port Matrix
Ensure your network firewall allows the following ingress and egress traffic:

| Source | Destination | Protocol / Port | Purpose |
| :--- | :--- | :--- | :--- |
| **App VM** | **Asterisk PBX** | `TCP 8088` | Asterisk ARI REST API & WebSocket event bus |
| **Asterisk PBX** | **App VM** | `TCP 8000` | HTTP media cache download (`/static/audio/*.wav`) |
| **Asterisk PBX** | **Telecom Carrier** | `UDP 5060` | SIP Trunk signaling |
| **Asterisk PBX** | **Telecom Carrier** | `UDP 10000-20000` | RTP real-time audio transmission |
| **Client Browsers** | **App VM** | `TCP 8000` (or `443`) | Admin Dashboard & Real-Time Analytics UI |

---

## 3. Asterisk / FreePBX Server Configuration (Mandatory PBX Setup)

> [!IMPORTANT]
> **CRITICAL AUDIO BUFFER FIX:** Fresh Asterisk and FreePBX distributions omit the media cache directory by default. If this step is skipped, picked-up calls will experience **complete silence** because Asterisk will fail to buffer the WAV announcement.

### Step 3.1: Create the Asterisk Media Cache Directory
SSH into the **Asterisk / FreePBX server** as `root` (or using `sudo`):

```bash
# 1. Create the standard Asterisk cache directory
mkdir -p /var/cache/asterisk

# 2. Grant full ownership to the asterisk service user
chown -R asterisk:asterisk /var/cache/asterisk

# 3. Apply read/write/execute permissions for owner and group
chmod 775 /var/cache/asterisk
```

#### Verification:
Run the following verification command on the PBX server:
```bash
ls -ld /var/cache/asterisk
```
**Expected Output:**
```text
drwxrwxr-x 2 asterisk asterisk ... /var/cache/asterisk
```

### Step 3.2: Enable Asterisk REST Interface (ARI)
On the FreePBX Web GUI or via the Asterisk terminal:

1. **Option A (Via FreePBX Web Interface):**
   - Navigate to **Settings** $\rightarrow$ **Advanced Settings**.
   - Locate **Asterisk REST Interface** and set **Enable the Asterisk REST Interface** to `Yes`.
   - Set **Asterisk REST Interface Read Only** to `No`.
   - Navigate to **Admin** $\rightarrow$ **Asterisk REST Interface Users**.
   - Click **Add User**:
     - **Username:** `fastapi_bot`
     - **Password:** `<Strong-Production-Password>`
     - **Read Only:** `No`
   - Click **Submit** and **Apply Config**.

2. **Option B (Direct Terminal Configuration):**
   Edit `/etc/asterisk/ari_custom.conf`:
   ```ini
   [general]
   enabled = yes
   pretty = yes
   allowed_origins = *

   [fastapi_bot]
   type = user
   read_only = no
   password = YourStrongAriPassword2026!
   ```
   Reload ARI inside Asterisk:
   ```bash
   asterisk -rx "ari reload"
   ```

### Step 3.3: Verify Network Connectivity Between PBX and App VM
From the **Asterisk server**, confirm that it can ping the Application VM and download audio assets over HTTP:
```bash
# Verify ping
ping -c 3 <APP_VM_IP>

# Verify HTTP audio accessibility (Replace <APP_VM_IP> with the actual App VM IP)
curl -I http://<APP_VM_IP>:8000/static/audio/initial_message.wav
```
*(A return status of `HTTP/1.1 200 OK` confirms Asterisk will stream announcements cleanly).*

---

## 4. Application VM Installation & Deployment

Log into the **Application VM** via SSH as the application user (e.g., `api_aliz` or `ubuntu`).

### Step 4.1: Install System Dependencies
```bash
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip curl
```

### Step 4.2: Clone the Binary Release Repository
```bash
cd /home/$USER
git clone https://github.com/RaiAbdullah1800/Compain_outbound_calling_general_Release.git
cd Compain_outbound_calling_general_Release
```

### Step 4.3: Create and Activate Python Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 4.4: Prepare Environment File
```bash
cp .env.example .env
nano .env
```
*(Populate `.env` with your institution's specific parameters as detailed in [Section 5](#5-environment-configuration-reference-env)).*

### Step 4.5: Provision the Initial Superuser / Admin
Initialize your administrator account with a secure password:
```bash
python create_superuser.py \
  --email admin@institution.edu.pk \
  --password "YourAdminSecurePassword2026!" \
  --name "Institution System Administrator"
```

### Step 4.6: Run Smoke Test in Foreground
```bash
python run.py
```
Check the terminal logs:
- Look for `🟢 Asterisk ARI WebSocket Connected!`
- Ensure the Uvicorn HTTP server starts listening on `0.0.0.0:8000`.
- Once verified, press `Ctrl + C` to stop the interactive run.

---

## 5. Environment Configuration Reference (`.env`)

Below is the complete, documented production `.env` reference template:

```ini
# ==============================================================================
# GENERAL APPLICATION & SECURITY CONFIGURATION
# ==============================================================================
PROJECT_NAME="Institutional AI Outbound Calling Assistant"
API_V1_STR="/api/v1"
SECRET_KEY="generate_a_random_64_character_hex_key_for_jwt_session_cookies"

# Organization Branding (Appears in Login UI and Header Badges)
ORGANIZATION_NAME="ALIZ College"
APP_TITLE="ALIZ College Campaign Telephony Hub"
DEFAULT_ADMIN_EMAIL="admin@aliz.edu.pk"
DEFAULT_ADMIN_NAME="ALIZ Administrator"

# ==============================================================================
# DATABASE CONFIGURATION
# ==============================================================================
# SQLite (Built-in, zero external dependencies):
DATABASE_URL="sqlite+aiosqlite:///./outbound_dialer.db"

# PostgreSQL (High-capacity multi-worker setups):
# DATABASE_URL="postgresql+asyncpg://dialer_user:StrongPassword@localhost:5432/dialer_db"

# ==============================================================================
# TELEPHONY & ASTERISK ARI INTEGRATION
# ==============================================================================
TELEPHONY_PROVIDER="asterisk"
DEFAULT_TELEPHONY_PROVIDER="asterisk"

# Asterisk FreePBX Server IP and ARI REST Port
ASTERISK_HOST="172.15.10.7"
ASTERISK_ARI_PORT=8088
ASTERISK_ARI_USER="fastapi_bot"
ASTERISK_ARI_PASSWORD="AlizCollegeAri@2026!"
ASTERISK_STASIS_APP="outbound_announcer"

# Crucial: IP address of the Application VM where Asterisk fetches WAV audio
AUDIO_SERVER_HOST="172.15.10.6"

# Outbound Context and Routing
ASTERISK_CONTEXT="from-internal"
ORIGINATION_MODE="LOCAL"
ASTERISK_OUTBOUND_TRUNK="0415474001"
OUTBOUND_TRUNK="0415474001"

# Primary Extension Fallback
EXTENSION_NUMBER="16001"
EXTENSION_PASSWORD="ExtensionPassword123"
OUTGOING_CALLER_ID="415474001"
DEFAULT_FROM_NUMBER="415474001"

# ==============================================================================
# MULTI-EXTENSION ROTATION SUITE (JSON ARRAY)
# Distributes outbound call volume across available trunk DIDs
# ==============================================================================
EXTENSION_SUITE_JSON='[
  {"ext": "16001", "caller_id": "415474001"},
  {"ext": "16002", "caller_id": "415474002"},
  {"ext": "16003", "caller_id": "415474003"},
  {"ext": "16004", "caller_id": "415474004"},
  {"ext": "16005", "caller_id": "415474006"},
  {"ext": "16006", "caller_id": "415474007"},
  {"ext": "16007", "caller_id": "415474008"},
  {"ext": "16008", "caller_id": "415474009"},
  {"ext": "16009", "caller_id": "415474010"},
  {"ext": "16010", "caller_id": "415474011"}
]'

# ==============================================================================
# CAMPAIGN DISPATCH CONTROLS & CARRIER SAFEGUARDS
# ==============================================================================
CALL_TIMEOUT=35
MAX_CONCURRENT_CALLS=5
MIN_CALLS_PER_HOUR=20
MAX_CALLS_PER_HOUR=30
OPERATING_HOURS_START="09:00"
OPERATING_HOURS_END="19:00"

# Carrier Circuit Breaker (Automatically pauses campaign if carrier returns consecutive declines)
CIRCUIT_BREAKER_DECLINE_THRESHOLD=20
CIRCUIT_BREAKER_COOLDOWN_MINUTES=30

# ==============================================================================
# REAL-TIME GOOGLE SHEETS LEAD SYNC (OPTIONAL)
# ==============================================================================
GOOGLE_SHEET_NAME="Campaign Interested Leads 2026"
GOOGLE_APPLICATION_CREDENTIALS="credentials/google_credentials.json"
```

---

## 6. Google Sheets Live Integration (Real-Time Lead Sync)

When recipients listen to the announcement and **press '1'** on their keypad to show interest, the engine automatically pushes their contact details, time of response, and assigned agent extension directly to a shared Google Sheet in real-time.

### Step 6.1: Obtain Service Account Credentials from Google Cloud Console
1. Navigate to the **[Google Cloud Console](https://console.cloud.google.com/)** and sign in with your institutional or department Gmail account.
2. In the top project selector bar, click **New Project**:
   - **Project Name:** `telephony-lead-sync`
   - Click **Create**, then select your new project.
3. In the top search bar, search for and enable the following two APIs:
   - **Google Sheets API** $\rightarrow$ Click **Enable**.
   - **Google Drive API** $\rightarrow$ Click **Enable**.
4. Create the Service Account:
   - Navigate to **IAM & Admin** $\rightarrow$ **Service Accounts** $\rightarrow$ Click **Create Service Account**.
   - **Name:** `sheets-telephony-bot`
   - **Role:** Select **Project $\rightarrow$ Editor** (or **Owner**).
   - Click **Done**.
5. Download the JSON Key:
   - Locate your newly created service account in the table.
   - Click the three dots ($\vdots$) $\rightarrow$ **Manage keys** $\rightarrow$ **Add Key** $\rightarrow$ **Create new key**.
   - Select **JSON** format and click **Create**.
   - The private credentials `.json` file will automatically download to your computer.
   - Note the **Service Account Email** (e.g., `sheets-telephony-bot@telephony-lead-sync.iam.gserviceaccount.com`).

### Step 6.2: Place Credentials on Application VM
Upload the downloaded `.json` file to the Application VM and lock down permissions:
```bash
mkdir -p /home/$USER/Compain_outbound_calling_general_Release/credentials
mv ~/downloaded_key.json /home/$USER/Compain_outbound_calling_general_Release/credentials/google_credentials.json
chmod 600 /home/$USER/Compain_outbound_calling_general_Release/credentials/google_credentials.json
```

### Step 6.3: Create and Share Google Spreadsheet
1. Open [Google Sheets](https://sheets.google.com/) and create a **Blank spreadsheet**.
2. Rename the spreadsheet title to match the exact string in your `.env` (e.g., `Campaign Interested Leads 2026`).
3. Set the column headers in **Row 1**:
   - `Column A:` **Timestamp**
   - `Column B:` **Candidate Name**
   - `Column C:` **Father Name**
   - `Column D:` **Mobile Number**
   - `Column E:` **College / Program**
   - `Column F:` **Extension / Line Used**
   - `Column G:` **Interested (Pressed 1)**
4. Click the green **Share** button in the top-right corner.
5. Paste the **Service Account Email** (`sheets-telephony-bot@...iam.gserviceaccount.com`), set the role to **Editor**, uncheck "Notify people", and click **Share**.

---

## 7. Systemd Production Daemon Setup (24/7 Auto-Start)

To ensure the dialer runs persistently, recovers automatically from server reboots, and logs diagnostic output cleanly, configure a systemd service.

### Step 7.1: Create Systemd Unit File
Create the service configuration file:
```bash
sudo nano /etc/systemd/system/outbound_dialer.service
```

Paste the following definition (adjust `/home/api_aliz` and user names to match your VM user):

```ini
[Unit]
Description=Institutional Asterisk Outbound Calling Assistant Service
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=api_aliz
Group=api_aliz
WorkingDirectory=/home/api_aliz/Compain_outbound_calling_general_Release
ExecStart=/home/api_aliz/Compain_outbound_calling_general_Release/venv/bin/python /home/api_aliz/Compain_outbound_calling_general_Release/run.py
Restart=always
RestartSec=5s
KillMode=process
LimitNOFILE=65536
Environment="PYTHONUNBUFFERED=1"

# Logging configuration
StandardOutput=journal
StandardError=journal
SyslogIdentifier=outbound_dialer

[Install]
WantedBy=multi-user.target
```

### Step 7.2: Enable and Start the Daemon
```bash
# Reload systemd manager configuration
sudo systemctl daemon-reload

# Enable service to automatically start on system boot
sudo systemctl enable outbound_dialer.service

# Start the service immediately
sudo systemctl start outbound_dialer.service

# Check live runtime status
sudo systemctl status outbound_dialer.service --no-pager
```

### Step 7.3: Real-Time Log Monitoring
To inspect live telephony events, channel origination logs, and DTMF keypress detections:
```bash
journalctl -u outbound_dialer.service -f
```

---

## 8. Smoke Testing & Live Verification

Perform this verification sequence after deployment:

1. **Web Dashboard Access:**
   - Open your web browser and navigate to: `http://<APP_VM_IP>:8000/login`
   - Log in using your superuser credentials (`admin@aliz.edu.pk`).
2. **PBX Connectivity:**
   - Verify that the top status bar in the dashboard shows: `🟢 PBX Gateway Online (ARI Connected)`.
3. **Execute Single Test Call:**
   - In the dashboard, enter your personal mobile number and trigger a single dispatch call.
4. **Inspect Asterisk Cache Buffer (on Asterisk PBX):**
   ```bash
   ls -la /var/cache/asterisk/
   ```
   *You should see a newly cached audio bucket file (e.g., `bucket-XXXXXX.wav`), confirming Asterisk downloaded and buffered the announcement cleanly.*
5. **Keypad DTMF Test:**
   - Answer the call on your phone.
   - Verify the audio announcement plays clearly.
   - When the announcement finishes and the tone sounds, press **1**.
   - Check your connected Google Sheet to verify that the row populated with your number and `YES`.

---

## 9. Operational Troubleshooting & Diagnostic Runbook

### Issue 1: Picked-up call is completely silent (no audio plays)
- **Root Cause:** Asterisk cannot create a temporary cache file for remote HTTP playback.
- **Remedy:** Ensure the Asterisk server has `/var/cache/asterisk` created and owned by `asterisk:asterisk`:
  ```bash
  ssh root@<ASTERISK_PBX_IP> "mkdir -p /var/cache/asterisk && chown -R asterisk:asterisk /var/cache/asterisk && chmod 775 /var/cache/asterisk"
  ```

### Issue 2: Service logs report `HTTP 401 Unauthorized` for Asterisk ARI
- **Root Cause:** Password mismatch between `.env` and `/etc/asterisk/ari.conf` or `/etc/asterisk/ari_additional.conf`.
- **Remedy:** Verify ARI credentials using Asterisk CLI:
  ```bash
  asterisk -rx "ari show user fastapi_bot"
  ```
  Ensure `ASTERISK_ARI_PASSWORD` in `.env` matches the password defined on Asterisk.

### Issue 3: Asterisk logs `Playback failed for sound:http://<APP_VM_IP>:8000/...`
- **Root Cause:** The Asterisk PBX cannot reach port 8000 on the Application VM due to Linux firewall (`ufw`) or wrong IP in `AUDIO_SERVER_HOST`.
- **Remedy:**
  1. On the Application VM, allow port 8000 from the PBX:
     ```bash
     sudo ufw allow from <ASTERISK_PBX_IP> to any port 8000 proto tcp
     ```
  2. Verify `.env` has `AUDIO_SERVER_HOST="<APP_VM_IP>"` (do NOT use `localhost` or `127.0.0.1` because Asterisk needs the network IP).

### Issue 4: Google Sheets logs `SpreadsheetNotFound` or `API Permission Denied`
- **Root Cause:** The Google Sheet has not been shared with the service account email, or the spreadsheet title does not match `GOOGLE_SHEET_NAME`.
- **Remedy:** Open the Google Spreadsheet in your browser, verify the title matches `.env` exactly, and ensure the service account email (`sheets-telephony-bot@...iam.gserviceaccount.com`) is added as an **Editor**.

### Issue 5: How to clear test calls from the database
To purge test call records and reset all live counters to 0 while keeping admin accounts intact:
```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('outbound_dialer.db')
c = conn.cursor()
c.execute('DELETE FROM calls')
conn.commit()
c.execute('VACUUM')
conn.commit()
conn.close()
print('Calls table cleaned successfully.')
"
```

---

## 10. Technical Support & Institutional Deployment
For questions regarding telecom pulse billing, Nayatel SIP trunk mappings, or custom multi-campus queue deployments, contact the Institutional Telephony Engineering Team.
