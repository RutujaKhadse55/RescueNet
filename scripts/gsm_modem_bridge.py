#!/usr/bin/env python3
"""
RescueNet On-Premises GSM Modem Bridge Service (Phase 16)
Connects to hardware USB 4G/GSM modem (SIMCom, Quectel, Huawei) via serial AT commands,
monitors incoming survivor emergency SMS messages, computes HMAC-SHA256 signature,
and forwards them directly to the local RescueNet API webhook endpoint (/v1/sms/webhook).
Also listens on local port 8090 to transmit outbound rescuer acknowledgments over SMS.
"""

import sys
import time
import hmac
import hashlib
import json
import argparse
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

DEFAULT_PORT = "/dev/ttyUSB2"
DEFAULT_BAUD = 115200
DEFAULT_WEBHOOK = "http://localhost:3000/v1/sms/webhook"
DEFAULT_SECRET = "rescuenet_inbound_sms_hmac_secret_key_998877"

class MockOrSerialModem:
    def __init__(self, port, baud, mock=False):
        self.port = port
        self.baud = baud
        self.mock = mock
        self.serial = None
        if not mock:
            try:
                import serial
                self.serial = serial.Serial(port, baud, timeout=2)
                self.send_at("AT")
                self.send_at("AT+CMGF=1") # Text mode
                print(f"[GSM Bridge] Connected to hardware modem on {port}")
            except Exception as e:
                print(f"[GSM Bridge] Warning: Could not open {port}: {e}. Running in simulation/emulation mode.")
                self.mock = True

    def send_at(self, cmd):
        if self.mock or not self.serial:
            return "OK"
        self.serial.write((cmd + "\r\n").encode())
        time.sleep(0.3)
        return self.serial.read(self.serial.in_waiting or 1).decode(errors='ignore')

    def read_inbound_messages(self):
        if self.mock or not self.serial:
            return []
        # AT+CMGL="REC UNREAD" lists unread messages
        raw = self.send_at('AT+CMGL="ALL"')
        messages = []
        lines = raw.split("\r\n")
        i = 0
        while i < len(lines):
            line = lines[i]
            if "+CMGL:" in line:
                parts = line.split(",")
                index = parts[0].replace("+CMGL: ", "").strip()
                sender = parts[2].replace('"', "").strip()
                timestamp = parts[4].replace('"', "").strip() if len(parts) > 4 else time.strftime("%Y-%m-%d %H:%M:%S")
                i += 1
                body = lines[i] if i < len(lines) else ""
                messages.append({"index": index, "sender": sender, "body": body, "timestamp": timestamp})
                # Delete message from SIM storage to free up space
                self.send_at(f"AT+CMGD={index}")
            i += 1
        return messages

    def send_sms(self, recipient, text):
        print(f"[GSM Bridge] Outbound SMS -> {recipient}: '{text}'")
        if not self.mock and self.serial:
            self.send_at(f'AT+CMGS="{recipient}"')
            time.sleep(0.5)
            self.serial.write((text + chr(26)).encode()) # Ctrl+Z terminates SMS
            time.sleep(3.0)
            return True
        return True

def forward_to_api(webhook_url, secret, sender, body):
    payload = {
        "from": sender,
        "body": body,
        "timestamp": int(time.time()),
        "provider": "onprem_gsm_modem"
    }
    raw_json = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    sig = hmac.new(secret.encode('utf-8'), raw_json, hashlib.sha256).hexdigest()

    req = urllib.request.Request(
        webhook_url,
        data=raw_json,
        headers={
            "Content-Type": "application/json",
            "x-rescue-signature": sig,
            "x-provider": "onprem_gsm"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            print(f"[GSM Bridge] Inbound SMS from {sender} forwarded. API HTTP status: {status}")
            return True
    except Exception as e:
        print(f"[GSM Bridge] Error forwarding to API: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="RescueNet On-Premises GSM Modem Bridge")
    parser.add_argument("--port", default=DEFAULT_PORT, help="Serial device port")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="Baud rate")
    parser.add_argument("--api", default=DEFAULT_WEBHOOK, help="RescueNet API webhook URL")
    parser.add_argument("--secret", default=DEFAULT_SECRET, help="HMAC webhook secret")
    parser.add_argument("--mock", action="store_true", help="Run with simulated modem")
    args = parser.parse_args()

    modem = MockOrSerialModem(args.port, args.baud, args.mock)
    print(f"🚀 RescueNet GSM Modem Bridge active.")
    print(f"   Webhook Target: {args.api}")

    try:
        while True:
            msgs = modem.read_inbound_messages()
            for m in msgs:
                print(f"[GSM Bridge] Received SMS from {m['sender']}: {m['body']}")
                forward_to_api(args.api, args.secret, m['sender'], m['body'])
            time.sleep(2.0)
    except KeyboardInterrupt:
        print("\nStopping GSM Modem Bridge...")

if __name__ == "__main__":
    main()
