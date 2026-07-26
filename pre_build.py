#!/usr/bin/env python3
"""
Pre-build script to inject Telegram configuration from .env file
"""
import os

# Get project directory
project_dir = os.environ.get('PROJECT_DIR', '.')

env_file = os.path.join(project_dir, '.env')
if os.path.exists(env_file):
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"\'')
                    if key == 'TELEGRAM_BOT_TOKEN':
                        os.environ['TELEGRAM_BOT_TOKEN'] = value
                        print(f"Found TELEGRAM_BOT_TOKEN: {value[:10]}...")
                    elif key == 'TELEGRAM_CHAT_ID':
                        os.environ['TELEGRAM_CHAT_ID'] = value
                        print(f"Found TELEGRAM_CHAT_ID: {value}")

# Export to PlatformIO build system
Import('env')
if 'TELEGRAM_BOT_TOKEN' in os.environ:
    env.Append(BUILD_FLAGS=['-DTELEGRAM_BOT_TOKEN=\\"' + os.environ['TELEGRAM_BOT_TOKEN'] + '\\"'])
    print(f"Added TELEGRAM_BOT_TOKEN build flag")
if 'TELEGRAM_CHAT_ID' in os.environ:
    env.Append(BUILD_FLAGS=['-DTELEGRAM_CHAT_ID=\\"' + os.environ['TELEGRAM_CHAT_ID'] + '\\"'])
    print(f"Added TELEGRAM_CHAT_ID build flag")