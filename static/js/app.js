"use strict";

const $ = (id) => document.getElementById(id);

const state = {
    packageCopies: 2,
    packagePrice: 100,
    packageId: "strips_2",
    photoStyle: "color",
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

// -------------------- SCREEN NAVIGATION --------------------

function showScreen(id) {
    screenIds.forEach((screenId) => {
        const screen = $(screenId);
        if (screen) {
            screen.classList.toggle("active", screenId === id);
        }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;
    }

    const video = $("camera-video");
    if (video) video.srcObject = null;
}

function resetSession() {
    stopCamera();

    state.photos = [];
    state.demoMode = false;
    state.busy = false;
    state.packageCopies = 2;
    state.packagePrice = 100;
    state.packageId = "strips_2";
    state.photoStyle = "color";

    document.querySelectorAll(".package-card").forEach((card) => {
        const selected = card.dataset.package === state.packageId;
        card.classList.toggle("selected", selected);
        card.setAttribute("aria-pressed", String(selected));
    });

    document.querySelectorAll("[data-photo-style]").forEach((button) => {
        const selected = button.dataset.photoStyle === state.photoStyle;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

    $("countdown").hidden = true;
    $("camera-placeholder").hidden = false;
    $("enable-camera").hidden = false;
    $("demo-camera").hidden = false;
    $("retake-button").hidden = true;
    $("capture-button").disabled = false;
    $("capture-button").textContent = "Take photo";

    updateThumbnails();
    updateOrder();
    showScreen("welcome-screen");
}

// -------------------- PHOTO THUMBNAILS --------------------

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

// -------------------- CAMERA --------------------

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

// -------------------- DEMO PHOTOS --------------------

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

// -------------------- CAPTURE PHOTOS --------------------

async function takePhoto() {
    if (state.busy) return;

    if (state.photos.length === 4) {
        await reviewPhotos();
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

            // Mirror the saved image to match the front-facing preview.
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            photo = canvas.toDataURL("image/jpeg", 0.94);
        }

        state.photos.push(photo);
        updateThumbnails();
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

// -------------------- PHOTO STRIP GENERATION --------------------

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
        return false;
    }

    const stripCanvas = $("strip-canvas");
    const sheetCanvas = $("final-strip");

    if (!stripCanvas || !sheetCanvas) {
        throw new Error("The photo-strip canvas elements are missing.");
    }

    const images = await Promise.all(state.photos.map(loadImage));

    // Draw the individual 2 x 6 strip.
    const ctx = stripCanvas.getContext("2d");
    const width = stripCanvas.width;
    const height = stripCanvas.height;

    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, width, height);

    const border = 24;
    const gap = 12;
    const header = 62;
    const footer = 68;

    const photoWidth = width - border * 2;
    const photoHeight =
        (height - header - footer - border * 2 - gap * 3) / 4;

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 25px Georgia";
    ctx.fillText("snapstory", width / 2, 40);

    images.forEach((image, index) => {
        const x = border;
        const y = header + border + index * (photoHeight + gap);

        // Center-crop each image without stretching it.
        const scale = Math.max(
            photoWidth / image.width,
            photoHeight / image.height
        );

        const sourceWidth = photoWidth / scale;
        const sourceHeight = photoHeight / scale;
        const sourceX = (image.width - sourceWidth) / 2;
        const sourceY = (image.height - sourceHeight) / 2;

        ctx.save();

        ctx.filter = state.photoStyle === "mono"
            ? "grayscale(1)"
            : "none";

        ctx.drawImage(
            image,
            sourceX, sourceY, sourceWidth, sourceHeight,
            x, y, photoWidth, photoHeight
        );

        ctx.restore();
    });

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(
        "A LITTLE MOMENT, FOREVER",
        width / 2,
        height - 30
    );

    // Draw two strips side by side on the 4 x 6 sheet.
    const sheetCtx = sheetCanvas.getContext("2d");

    sheetCtx.fillStyle = "#ffffff";
    sheetCtx.fillRect(
        0, 0,
        sheetCanvas.width,
        sheetCanvas.height
    );

    const halfWidth = sheetCanvas.width / 2;

    sheetCtx.drawImage(
        stripCanvas,
        0, 0, halfWidth, sheetCanvas.height
    );

    sheetCtx.drawImage(
        stripCanvas,
        halfWidth, 0, halfWidth, sheetCanvas.height
    );

    return true;
}

async function reviewPhotos() {
    try {
        const built = await buildStrip();

        if (built) {
            showScreen("preview-screen");
        }
    } catch (error) {
        console.error("Photo-strip generation failed:", error);
        alert(`Could not generate your photo strip: ${error.message}`);
    }
}

// -------------------- PACKAGE AND ORDER SUMMARY --------------------

function updateOrder() {
    const name = `Snapstory — ${state.packageCopies} strips`;

    const description =
        `4 photographs · ${state.packageCopies} strips · ` +
        `${state.packageCopies / 2} sheets`;

    $("payment-package-name").textContent = name;
    $("payment-package-description").textContent = description;
    $("payment-total").textContent = `₹${state.packagePrice}`;

    $("order-title").textContent = name;
    $("order-detail").textContent = description;
    $("order-price").textContent = `₹${state.packagePrice}`;
}

function getSheetCount() {
    return Math.ceil(state.packageCopies / 2);
}

// Register each package click handler exactly once.
document.querySelectorAll(".package-card").forEach((card) => {
    card.addEventListener("click", () => {
        document.querySelectorAll(".package-card").forEach((item) => {
            item.classList.remove("selected");
            item.setAttribute("aria-pressed", "false");
        });

        card.classList.add("selected");
        card.setAttribute("aria-pressed", "true");

        state.packageCopies = Number(card.dataset.copies);
        state.packagePrice = Number(card.dataset.price);
        state.packageId = card.dataset.package;

        updateOrder();
    });
});

// -------------------- COLOR / MONOCHROME SELECTION --------------------

document.querySelectorAll("[data-photo-style]").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelectorAll("[data-photo-style]").forEach((item) => {
            item.classList.remove("selected");
            item.setAttribute("aria-pressed", "false");
        });

        button.classList.add("selected");
        button.setAttribute("aria-pressed", "true");

        state.photoStyle = button.dataset.photoStyle;
    });
});

// -------------------- GENERAL NAVIGATION --------------------

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

// -------------------- RAZORPAY PAYMENT --------------------

$("pay-button").addEventListener("click", async () => {
    const button = $("pay-button");

    // Prevent accidental duplicate order requests.
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "Connecting securely...";

    try {
        if (!state.packageId) {
            throw new Error("Please select a package before paying.");
        }

        /*
         * IMPORTANT FIX:
         * Create the order through Flask before reading response.json().
         */
        const response = await fetch("/api/payment/create-order", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                package_id: state.packageId
            })
        });

        let order;

        try {
            order = await response.json();
        } catch {
            throw new Error(
                "The server returned an unreadable response while creating the payment order."
            );
        }

        if (!response.ok) {
            throw new Error(
                order.error ||
                order.message ||
                "Could not create payment order."
            );
        }

        if (!order || !order.order_id || !order.key_id) {
            throw new Error(
                "The server response is missing Razorpay order details. " +
                "Check the Flask server logs and payment configuration."
            );
        }

        if (!window.Razorpay) {
            throw new Error(
                "Razorpay Checkout did not load. Check your internet connection."
            );
        }

        const checkout = new Razorpay({
            key: order.key_id,
            amount: order.amount,
            currency: order.currency || "INR",
            name: order.name || "Snapstory",
            description:
                order.description ||
                `Snapstory — ${state.packageCopies} strips`,
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

                    let result;

                    try {
                        result = await verificationResponse.json();
                    } catch {
                        throw new Error(
                            "The server returned an unreadable payment-verification response."
                        );
                    }

                    if (!verificationResponse.ok || !result.verified) {
                        throw new Error(
                            result.error ||
                            result.message ||
                            "Payment verification failed."
                        );
                    }

                    // Proceed only after backend payment verification.
                    showScreen("camera-screen");
                } catch (error) {
                    console.error("Payment verification error:", error);

                    alert(
                        `${error.message}\n` +
                        "Please do not pay again immediately. " +
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

            alert(
                description +
                " You can retry after checking the transaction status."
            );

            button.disabled = false;
            button.textContent = "Pay securely →";
        });

        checkout.open();
    } catch (error) {
        console.error("Checkout error:", error);

        alert(
            error.message ||
            "Something went wrong while starting checkout."
        );

        button.disabled = false;
        button.textContent = "Pay securely →";
    }
});

// -------------------- CAMERA CONTROLS --------------------

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

// -------------------- PRINT PREVIEW --------------------

$("print-button").addEventListener("click", () => {
    const sheets = getSheetCount();

    updateOrder();

    $("confirm-print").textContent =
        `Simulate printing ${sheets} sheet${sheets === 1 ? "" : "s"} ` +
        `(${state.packageCopies} strips)`;

    showScreen("print-screen");
});

$("confirm-print").addEventListener("click", () => {
    const sheets = getSheetCount();
    const strips = state.packageCopies;

    stopCamera();

    $("completion-message").textContent =
        `Print simulation complete! ` +
        `${sheets} sheet${sheets === 1 ? "" : "s"} ` +
        `would produce ${strips} strips. ` +
        `Each sheet contains two identical strips. ` +
        `No physical print or payment was made.`;

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

// -------------------- INITIALIZE --------------------

updateThumbnails();
updateOrder();