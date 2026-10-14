
const $ = (id) => document.getElementById(id);

const state = {
    packageCopies: 1,
    packagePrice: 99,
    photos: [],
    cameraStream: null,
    demoMode: false,
    busy: false
};

const screenIds = [
    "welcome-screen",
    "package-screen",
    "payment-screen",
    "camera-screen",
    "preview-screen",
    "print-screen",
    "complete-screen"
];

function showScreen(id) {
    screenIds.forEach((screenId) => {
        $(screenId).classList.toggle("active", screenId === id);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;
    }

    $("camera-video").srcObject = null;
}

function resetSession() {
    stopCamera();
    state.photos = [];
    state.demoMode = false;
    state.busy = false;

    $("countdown").hidden = true;
    $("camera-placeholder").hidden = false;
    $("enable-camera").hidden = false;
    $("demo-camera").hidden = false;
    $("retake-button").hidden = true;
    $("capture-button").disabled = false;
    $("capture-button").textContent = "Take photo";
    $("camera-instruction").textContent =
        "Find your pose. Your first photo is coming up.";

    updateThumbnails();
    showScreen("welcome-screen");
}

function updateThumbnails() {
    const container = $("thumbnail-list");
    container.replaceChildren();

    for (let i = 0; i < 4; i++) {
        const thumbnail = document.createElement("div");
        thumbnail.className = "thumbnail";

        if (state.photos[i]) {
            const image = document.createElement("img");
            image.src = state.photos[i];
            image.alt = `Captured photo ${i + 1}`;
            thumbnail.appendChild(image);
        } else {
            thumbnail.classList.add("empty");
            thumbnail.textContent = String(i + 1).padStart(2, "0");
        }

        container.appendChild(thumbnail);
    }

    const count = Math.min(state.photos.length + 1, 4);
    $("photo-counter").textContent =
        `PHOTO ${String(count).padStart(2, "0")} / 04`;

    $("retake-button").hidden = state.photos.length === 0;
    $("capture-button").textContent =
        state.photos.length === 4 ? "Review my photos" : "Take photo";

    $("camera-instruction").textContent =
        state.photos.length === 4
            ? "All four photos are ready. Review your strip."
            : `Photo ${state.photos.length + 1} of 4. Get ready to smile!`;
}

async function enableCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        alert("Camera access is unavailable. Try a modern browser on localhost.");
        return;
    }

    try {
        stopCamera();

        state.cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 960 }
            }
        });

        const video = $("camera-video");
        video.srcObject = state.cameraStream;
        await video.play();

        $("camera-placeholder").hidden = true;
        state.demoMode = false;
    } catch (error) {
        console.error("Camera initialization failed:", error);

        alert(
            "Could not open the camera. Check browser permissions and close " +
            "other apps using it, or choose demo mode."
        );
    }
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countdown() {
    const element = $("countdown");
    element.hidden = false;

    for (let i = 3; i >= 1; i--) {
        element.textContent = i;
        await wait(800);
    }

    element.textContent = "Smile!";
    await wait(350);
    element.hidden = true;
}

function makeDemoPhoto() {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;

    const ctx = canvas.getContext("2d");
    const index = state.photos.length;

    const colors = [
        ["#d9bba1", "#82634e"],
        ["#d5d7c7", "#5b7060"],
        ["#e8c9c4", "#9b625d"],
        ["#c8d3df", "#526a83"]
    ];

    const [background, accent] = colors[index % colors.length];

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(450, 430, 190, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff9f0";
    ctx.beginPath();
    ctx.arc(450, 370, 105, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(450, 800, 230, 240, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff9f0";
    ctx.font = "32px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("SNAPSTORY", 450, 1080);
    ctx.font = "24px Arial";
    ctx.fillText(`DEMO FRAME ${index + 1}`, 450, 1130);

    return canvas.toDataURL("image/jpeg", 0.92);
}

async function takePhoto() {
    if (state.busy) return;

    if (state.photos.length === 4) {
        buildStrip();
        showScreen("preview-screen");
        return;
    }

    if (!state.demoMode && !state.cameraStream) {
        alert("Enable your camera or select demo mode first.");
        return;
    }

    state.busy = true;
    $("capture-button").disabled = true;

    try {
        await countdown();

        let photo;

        if (state.demoMode) {
            photo = makeDemoPhoto();
        } else {
            const video = $("camera-video");

            if (!video.videoWidth || !video.videoHeight) {
                throw new Error("Camera video is not ready.");
            }

            const canvas = $("capture-canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext("2d");
            ctx.save();

            // Mirror the front-facing camera preview in the saved image.
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            photo = canvas.toDataURL("image/jpeg", 0.94);
        }

        state.photos.push(photo);
        updateThumbnails();

        if (state.photos.length === 4) {
            $("capture-button").textContent = "Review my photos";
        }
    } catch (error) {
        console.error("Capture failed:", error);
        alert(`Photo capture failed: ${error.message}`);
    } finally {
        state.busy = false;
        $("capture-button").disabled = false;
    }
}

function retakeLastPhoto() {
    if (state.busy || state.photos.length === 0) return;

    state.photos.pop();
    updateThumbnails();
}

function drawStrip(canvas) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    const margin = 36;
    const gap = 16;
    const headerHeight = 100;
    const footerHeight = 90;
    const photoHeight =
        (height - headerHeight - footerHeight - 2 * margin - 3 * gap) / 4;

    ctx.fillStyle = "#fffdf9";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#292720";
    ctx.textAlign = "center";
    ctx.font = "bold 25px Arial";
    ctx.fillText("SNAPSTORY", width / 2, 47);

    ctx.fillStyle = "#817c72";
    ctx.font = "16px Arial";
    ctx.fillText("FOUR FRAMES. ONE MEMORY.", width / 2, 75);

    const images = state.photos.map((src) => {
        const image = new Image();
        image.src = src;
        return image;
    });

    // All captured images are loaded before this function is called.
    images.forEach((image, index) => {
        const y = headerHeight + margin + index * (photoHeight + gap);
        const x = margin;
        const photoWidth = width - margin * 2;

        const scale = Math.max(
            photoWidth / image.width,
            photoHeight / image.height
        );

        const sourceWidth = photoWidth / scale;
        const sourceHeight = photoHeight / scale;
        const sourceX = (image.width - sourceWidth) / 2;
        const sourceY = (image.height - sourceHeight) / 2;

        ctx.drawImage(
            image,
            sourceX, sourceY, sourceWidth, sourceHeight,
            x, y, photoWidth, photoHeight
        );
    });

    ctx.fillStyle = "#956b52";
    ctx.font = "italic 23px Georgia";
    ctx.fillText("Keep this little moment.", width / 2, height - 30);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not load photo."));
        image.src = src;
    });
}

async function buildStrip() {
    if (state.photos.length !== 4) {
        alert("Four photographs are required to create your strip.");
        return;
    }

    const preview = $("strip-canvas");
    const finalStrip = $("final-strip");

    // Load images first so canvas drawing cannot race image loading.
    const images = await Promise.all(state.photos.map(loadImage));

    for (const canvas of [preview, finalStrip]) {
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

        const margin = 36;
        const gap = 16;
        const headerHeight = 100;
        const footerHeight = 90;
        const photoHeight =
            (height - headerHeight - footerHeight - 2 * margin - 3 * gap) / 4;
        const photoWidth = width - 2 * margin;

        ctx.fillStyle = "#fffdf9";
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = "center";
        ctx.fillStyle = "#292720";
        ctx.font = "bold 25px Arial";
        ctx.fillText("SNAPSTORY", width / 2, 47);
        ctx.fillStyle = "#817c72";
        ctx.font = "16px Arial";
        ctx.fillText("FOUR FRAMES. ONE MEMORY.", width / 2, 75);

        images.forEach((image, index) => {
            const scale = Math.max(
                photoWidth / image.width,
                photoHeight / image.height
            );

            const sourceWidth = photoWidth / scale;
            const sourceHeight = photoHeight / scale;
            const sourceX = (image.width - sourceWidth) / 2;
            const sourceY = (image.height - sourceHeight) / 2;
            const x = margin;
            const y = headerHeight + margin + index * (photoHeight + gap);

            ctx.drawImage(
                image,
                sourceX, sourceY, sourceWidth, sourceHeight,
                x, y, photoWidth, photoHeight
            );
        });

        ctx.fillStyle = "#956b52";
        ctx.font = "italic 23px Georgia";
        ctx.fillText("Keep this little moment.", width / 2, height - 30);
    }
}

async function reviewPhotos() {
    await buildStrip();
    showScreen("preview-screen");
}

function updateOrder() {
    const name = state.packageCopies === 1
        ? "The Classic"
        : "The Double";

    const description =
        `4 photographs · ${state.packageCopies} strip` +
        (state.packageCopies > 1 ? "s" : "");

    $("payment-package-name").textContent = name;
    $("payment-package-description").textContent = description;
    $("payment-total").textContent = `₹${state.packagePrice}`;

    $("order-title").textContent = name;
    $("order-detail").textContent = description;
    $("order-price").textContent = `₹${state.packagePrice}`;
}

document.querySelectorAll(".package-card").forEach((card) => {
    card.addEventListener("click", () => {
        document.querySelectorAll(".package-card").forEach((item) => {
            item.classList.remove("selected");
        });

        card.classList.add("selected");
        state.packageCopies = Number(card.dataset.copies);
        state.packagePrice = Number(card.dataset.price);
    });
});

$("start-button").addEventListener("click", () => {
    showScreen("package-screen");
});

$("home-link").addEventListener("click", (event) => {
    event.preventDefault();
    resetSession();
});

$("continue-button").addEventListener("click", () => {
    stopCamera();
    state.photos = [];
    state.busy = false;

    updateThumbnails();
    updateOrder();
    showScreen("payment-screen");
});

$("payment-back").addEventListener("click", () => {
    showScreen("package-screen");
});


$("pay-button").addEventListener("click", async () => {
    const button = $("pay-button");
    button.disabled = true;
    button.textContent = "Connecting securely...";

    try {
        const selectedCard = document.querySelector(
            ".package-card.selected"
        );

        const packageId =
            Number(selectedCard.dataset.copies) === 1
                ? "classic"
                : "double";

        const response = await fetch("/api/payment/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ package_id: packageId })
        });

        const order = await response.json();

        if (!response.ok) {
            throw new Error(order.error || "Could not create payment order.");
        }

        if (!window.Razorpay) {
            throw new Error(
                "Razorpay Checkout did not load. Check your internet connection."
            );
        }

        const checkout = new Razorpay({
            key: order.key_id,
            amount: order.amount,
            currency: order.currency,
            name: order.name,
            description: order.description,
            order_id: order.order_id,

            method: {
                upi: true,
                card: true,
                netbanking: true,
                wallet: true
                },

            handler: async function (paymentResponse) {
                button.textContent = "Verifying payment...";

                try {
                    const verificationResponse = await fetch(
                        "/api/payment/verify",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(paymentResponse)
                        }
                    );

                    const result = await verificationResponse.json();

                    if (!verificationResponse.ok || !result.verified) {
                        throw new Error(
                            result.error || "Payment verification failed."
                        );
                    }

                    // The server verified the payment before continuing.
                    showScreen("camera-screen");

                } catch (error) {
                    alert(
                        error.message +
                        "\nPlease do not pay again immediately. " +
                        "Check the transaction status first."
                    );
                } finally {
                    button.disabled = false;
                    button.textContent = "Pay securely →";
                }
            },

            modal: {
                ondismiss: function () {
                    button.disabled = false;
                    button.textContent = "Pay securely →";
                }
            },

            theme: {
                color: "#292720"
            }
        });

        checkout.on("payment.failed", function (event) {
            const description =
                event.error?.description || "Payment failed.";

            alert(description + " You can retry after checking the status.");
        });

        checkout.open();

    } catch (error) {
        console.error("Checkout error:", error);
        alert(error.message);

        button.disabled = false;
        button.textContent = "Pay securely →";
    }
});


$("enable-camera").addEventListener("click", enableCamera);

$("demo-camera").addEventListener("click", () => {
    stopCamera();
    state.demoMode = true;
    $("camera-placeholder").hidden = true;
    updateThumbnails();
});

$("capture-button").addEventListener("click", async () => {
    if (state.photos.length === 4) {
        await reviewPhotos();
    } else {
        await takePhoto();
    }
});

$("retake-button").addEventListener("click", retakeLastPhoto);

$("redo-button").addEventListener("click", () => {
    state.photos = [];
    updateThumbnails();
    showScreen("camera-screen");
});

$("print-button").addEventListener("click", () => {
    updateOrder();
    showScreen("print-screen");
});

$("confirm-print").addEventListener("click", () => {
    stopCamera();
    $("completion-message").textContent =
        `Demo complete. Your ${state.packageCopies} strip(s) are ready in the preview. No physical print or payment was made.`;

    showScreen("complete-screen");
});

$("new-session").addEventListener("click", resetSession);

document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.go === "package-screen") {
            resetSession();
            showScreen("package-screen");
        } else {
            showScreen(button.dataset.go);
        }
    });
});

updateThumbnails();
