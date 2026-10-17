
import os
import uuid
from pathlib import Path

import psycopg
import razorpay
from dotenv import load_dotenv
from psycopg.rows import dict_row
from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
PAYMENT_MODE = os.getenv("PAYMENT_MODE", "test")
DATABASE_URL = os.getenv("DATABASE_URL", "")

PACKAGES = {
    "strips_2": {
        "name": "Snapstory - 2 Strips",
        "copies": 2,
        "amount": 10000,
    },
    "strips_4": {
        "name": "Snapstory - 4 Strips",
        "copies": 4,
        "amount": 20000,
    },
    "strips_6": {
        "name": "Snapstory - 6 Strips",
        "copies": 6,
        "amount": 40000,
    },
}


def get_client():
    mode = PAYMENT_MODE.strip().lower()

    if mode not in ("test", "live"):
        raise RuntimeError("PAYMENT_MODE must be test or live.")

    if not KEY_ID or not KEY_SECRET:
        raise RuntimeError("Razorpay API keys are not configured.")

    expected_prefix = "rzp_test_" if mode == "test" else "rzp_live_"

    if not KEY_ID.startswith(expected_prefix):
        raise RuntimeError(
            f"PAYMENT_MODE={mode} requires a {expected_prefix} Key ID."
        )

    return razorpay.Client(auth=(KEY_ID, KEY_SECRET))


def connect_db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured.")

    # Open a fresh connection per operation. Disable automatic prepared
    # statements for compatibility with transaction-pooling connections.
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        prepare_threshold=None,
        connect_timeout=10,
    )


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/health")
def health():
    # Does not expose database credentials or payment details.
    try:
        with connect_db() as connection:
            connection.execute("SELECT 1")
        return jsonify(status="ok", database="connected")
    except Exception:
        app.logger.exception("Database health check failed.")
        return jsonify(status="error", database="unavailable"), 503


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
            connection.execute(
                """
                INSERT INTO public.payment_orders
                    (order_id, package_id, package_name, copies,
                     amount, currency, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    order["id"],
                    package_id,
                    package["name"],
                    package["copies"],
                    package["amount"],
                    "INR",
                    "created",
                ),
            )

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
        return jsonify(
            error="Missing payment verification fields."
        ), 400

    try:
        with connect_db() as connection:
            order = connection.execute(
                """
                SELECT *
                FROM public.payment_orders
                WHERE order_id = %s
                """,
                (order_id,),
            ).fetchone()

        if order is None:
            return jsonify(error="Unknown payment order."), 400

        if order["status"] == "paid":
            if order["payment_id"] == payment_id:
                return jsonify(
                    verified=True,
                    package_id=order["package_id"],
                )
            return jsonify(error="Order has already been used."), 409

        if order["status"] != "created":
            return jsonify(error="Order is not payable."), 409

        client = get_client()

        # Verify the checkout signature on the server.
        client.utility.verify_payment_signature({
            "razorpay_order_id": order["order_id"],
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })

        payment = client.payment.fetch(payment_id)

        if payment.get("order_id") != order["order_id"]:
            return jsonify(
                error="Payment does not match the order."
            ), 400

        if payment.get("amount") != order["amount"]:
            return jsonify(error="Payment amount mismatch."), 400

        if payment.get("currency") != order["currency"]:
            return jsonify(error="Payment currency mismatch."), 400

        if payment.get("status") != "captured":
            return jsonify(
                error=(
                    "Payment is not captured yet. "
                    "Check the payment status before retrying."
                )
            ), 409

        # Mark payment as paid and create its session record atomically.
        with connect_db() as connection:
            result = connection.execute(
                """
                UPDATE public.payment_orders
                SET status = 'paid',
                    payment_id = %s,
                    paid_at = NOW()
                WHERE order_id = %s
                  AND status = 'created'
                """,
                (payment_id, order_id),
            )

            if result.rowcount != 1:
                return jsonify(
                    error="Order state changed. Check its status."
                ), 409

            connection.execute(
                """
                INSERT INTO public.booth_sessions (order_id)
                VALUES (%s)
                ON CONFLICT (order_id) DO NOTHING
                """,
                (order_id,),
            )

        return jsonify(
            verified=True,
            package_id=order["package_id"],
        )

    except razorpay.errors.SignatureVerificationError:
        return jsonify(
            error="Payment signature verification failed."
        ), 400

    except Exception:
        app.logger.exception("Payment verification failed.")
        return jsonify(
            error=(
                "Could not verify payment. "
                "Please contact the operator before retrying."
            )
        ), 502


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
    )
