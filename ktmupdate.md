# Deploy Backend Script

This script automates backend deployment by:

1. Building the backend locally.
2. Uploading project files to a remote server using `rsync`.
3. Restarting the PM2 application on the server.

## Requirements

### Local Machine

* Bash
* rsync
* SSH
* Node.js managed by NVM
* A valid SSH private key

### Remote Server

* SSH access
* PM2 installed
* Node.js installed (if required by the application)

---

## Installation

Make the script executable:

```bash
chmod +x deploy-backend
```

Optionally place it in your PATH:

```bash
mkdir -p ~/.local/bin
cp deploy-backend ~/.local/bin/
chmod +x ~/.local/bin/deploy-backend
```

---

## Usage

The script supports three configuration methods:

### 1. Config File

Create a configuration file:

```bash
SERVER=ubuntu@193.123.86.242
KEY=/home/user/.ssh/server.pem
PROJECT=/home/user/projects/my-project

REMOTE_DIR=/home/ubuntu/webapp
NODE_VERSION=24.11.0
PM2_APP=my-app
```

Run:

```bash
deploy-backend --config deploy.conf
```

or

```bash
deploy-backend -c deploy.conf
```

---

### 2. Command Line Arguments

Run:

```bash
deploy-backend \
  --key ~/.ssh/server.pem \
  --project ~/projects/my-project
```

or

```bash
deploy-backend \
  -k ~/.ssh/server.pem \
  -p ~/projects/my-project
```

The script will use the default values for:

* REMOTE_DIR
* NODE_VERSION
* PM2_APP

unless overridden through a config file.

---

### 3. Interactive Mode

Run:

```bash
deploy-backend
```

The script will prompt for any missing values.

Example:

```text
SSH key path: ~/.ssh/server.pem
Project path: ~/projects/my-project
Server (user@host): ubuntu@193.123.86.242
```

---

## Default Values

The script currently uses:

```bash
REMOTE_DIR=/home/ubuntu/webapp
NODE_VERSION=24.11.0
PM2_APP=my-app
```

These may be changed directly in the script or overridden through a config file.

---

## Deployment Flow

The script performs the following steps:

### 1. Build Backend

```bash
source ~/.nvm/nvm.sh
nvm use <NODE_VERSION>

cd <PROJECT>/backend
npm run build
```

### 2. Upload Files

Uses rsync while excluding:

```text
node_modules
.git
frontend
.env
backend/.env
```

### 3. Restart PM2

Runs on the remote server:

```bash
pm2 restart <PM2_APP>
```

---

## Example Config

```bash
SERVER=ubuntu@example.com
KEY=/home/user/.ssh/deploy.pem
PROJECT=/home/user/projects/monkeytype-ktm

REMOTE_DIR=/home/ubuntu/webapp
NODE_VERSION=24.11.0
PM2_APP=my-app
```

Deploy using:

```bash
deploy-backend --config deploy.conf
```

---

## Troubleshooting

### PM2 Not Found

If deployment succeeds but PM2 cannot be found:

```text
bash: pm2: command not found
```

Update the restart command to load your shell environment:

```bash
ssh -i "$KEY" "$SERVER" 'bash -lc "pm2 restart my-app"'
```

or source NVM before running PM2.

### SSH Permission Denied

Verify:

* The key path is correct.
* The key has proper permissions.

```bash
chmod 600 ~/.ssh/server.pem
```

### NVM Not Found

Verify NVM is installed:

```bash
ls ~/.nvm/nvm.sh
```

and update the path in the script if necessary.

---

## Example Commands

Deploy using a config file:

```bash
deploy-backend -c deploy.conf
```

Deploy using flags:

```bash
deploy-backend \
  -k ~/.ssh/server.pem \
  -p ~/projects/monkeytype-ktm
```

Deploy interactively:

```bash
deploy-backend
```
