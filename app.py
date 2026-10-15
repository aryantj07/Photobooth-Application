
import os
import sqlite3
import uuid
from pathlib import Path

import razorpay
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
PAYMENT_MODE = os.getenv("PAYMENT_MODE", "test")

# Prices are controlled by the server, never by browser input.

PACKAGES = {
    "strips_2": {
        "name": "Snapstory - 2 Strips",
        "copies": 2,
        "amount": 10000,  # ₹100 in paise
    },
    "strips_4": {
        "name": "Snapstory - 4 Strips",
        "copies": 4,
        "amount": 20000,  # ₹200 in paise
    },
    "strips_6": {
        "name": "Snapstory - 6 Strips",
        "copies": 6,
        "amount": 40000,  # ₹400 in paise
    },
}


# Vercel's /tmp directory is writable but temporary.
# Locally, keep using the project database.
if os.getenv("VERCEL"):
    DB_PATH = Path("/tmp/snapstory.db")
else:
    DB_PATH = BASE_DIR / "snapstory.db"


def get_client():
    if not KEY_ID or not KEY_SECRET:
        raise RuntimeError("Razorpay API keys are not configured.")

    if PAYMENT_MODE != "test":
        raise RuntimeError(
            "This development build only permits PAYMENT_MODE=test."
        )

    if not KEY_ID.startswith("rzp_test_"):
        raise RuntimeError("Test Mode Key ID is required.")

    return razorpay.Client(auth=(KEY_ID, KEY_SECRET))


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db():
    with connect_db() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS payment_orders (
                order_id TEXT PRIMARY KEY,
                package_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                currency TEXT NOT NULL,
                payment_id TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


initialize_db()


@app.get("/")
def home():
    return render_template("index.html")


@app.post("/api/payment/create-order")
def create_payment_order():
    data = request.get_json(silent=True) or {}
    package_id = data.get("package_id")

    package = PACKAGES.get(package_id)
    if package is None:
        return jsonify(error="Invalid package selected."), 400

    try:
        client = get_client()

        order = client.order.create(data={
            "amount": package["amount"],
            "currency": "INR",
            "receipt": f"snapstory_{uuid.uuid4().hex[:20]}",
            "notes": {
                "package_id": package_id,
                "product": "Snapstory",
            },
        })

        with connect_db() as connection:
            connection.execute("""
                INSERT INTO payment_orders
                    (order_id, package_id, amount, currency, status)
                VALUES (?, ?, ?, ?, ?)
            """, (
                order["id"],
                package_id,
                package["amount"],
                "INR",
                "created",
            ))

        return jsonify({
            "key_id": KEY_ID,
            "order_id": order["id"],
            "amount": package["amount"],
            "currency": "INR",
            "name": "Snapstory",
            "description": package["name"],
            "package_id": package_id,
        })

    except Exception:
        app.logger.exception("Could not create Razorpay order.")
        return jsonify(
            error="Unable to start payment. Please try again."
        ), 502


@app.post("/api/payment/verify")
def verify_payment():
    data = request.get_json(silent=True) or {}

    order_id = data.get("razorpay_order_id")
    payment_id = data.get("razorpay_payment_id")
    signature = data.get("razorpay_signature")

    if not all(
        isinstance(value, str) and value
        for value in (order_id, payment_id, signature)
    ):
        return jsonify(error="Missing payment verification fields."), 400

    with connect_db() as connection:
        order = connection.execute(
            "SELECT * FROM payment_orders WHERE order_id = ?",
            (order_id,),
        ).fetchone()

    if order is None:
        return jsonify(error="Unknown payment order."), 400

    # A previously verified order cannot authorize another session.
    if order["status"] == "paid":
        if order["payment_id"] == payment_id:
            return jsonify(
                verified=True,
                package_id=order["package_id"],
            )
        return jsonify(error="Order has already been used."), 409

    if order["status"] != "created":
        return jsonify(error="Order is not payable."), 409

    try:
        client = get_client()

        # Use the order ID stored by our backend, not an order
        # ID supplied independently by the browser.
        client.utility.verify_payment_signature({
            "razorpay_order_id": order["order_id"],
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })

        payment = client.payment.fetch(payment_id)

        if payment.get("order_id") != order["order_id"]:
            return jsonify(error="Payment does not match the order."), 400

        if payment.get("amount") != order["amount"]:
            return jsonify(error="Payment amount mismatch."), 400

        if payment.get("currency") != order["currency"]:
            return jsonify(error="Payment currency mismatch."), 400

        # This build authorizes the session only after capture.
        # Configure automatic capture in Razorpay for the intended flow.
        if payment.get("status") != "captured":
            return jsonify(
                error=(
                    "Payment is not captured yet. "
                    "Please check payment status before retrying."
                )
            ), 409

        with connect_db() as connection:
            result = connection.execute("""
                UPDATE payment_orders
                SET status = 'paid', payment_id = ?
                WHERE order_id = ? AND status = 'created'
            """, (payment_id, order_id))

            if result.rowcount != 1:
                return jsonify(
                    error="Order state changed. Please check its status."
                ), 409

        return jsonify(
            verified=True,
            package_id=order["package_id"],
        )

    except razorpay.errors.SignatureVerificationError:
        return jsonify(error="Payment signature verification failed."), 400

    except Exception:
        app.logger.exception("Payment verification failed.")
        return jsonify(
            error="Could not verify payment. Please contact the operator."
        ), 502


if __name__ == "__main__":
    # Keep the local API private to this computer.
    app.run(host="127.0.0.1", port=5000, debug=True)
