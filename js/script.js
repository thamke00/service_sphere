/* ===================================================
   API URL (LOCAL / DEPLOYED)
=================================================== */

const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://servicesphere-production.up.railway.app";


/* ===================================================
   AUTH TOKEN HELPERS
=================================================== */

function getToken() {
    return localStorage.getItem("authToken");
}

function saveToken(token) {
    localStorage.setItem("authToken", token);
}

function clearAuthData() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
}


/* ===================================================
   FORM SWITCH (REGISTER ↔ LOGIN)
=================================================== */

function showLogin() {
    document.getElementById("registerForm").style.display = "none";
    document.getElementById("loginForm").style.display = "block";
}

function showRegister() {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("registerForm").style.display = "block";
}


/* ===================================================
   REGISTER USER
=================================================== */

async function registerUser() {

    const userData = {
        name: document.getElementById("r_name").value.trim(),
        email: document.getElementById("r_email").value.trim(),
        password: document.getElementById("r_password").value,
        phone: document.getElementById("r_phone").value.trim(),
        role: document.getElementById("r_role").value
    };

    try {

        const res = await fetch(API_URL + "/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });

        // ✅ safely read JSON even for 400/500 responses
        const data = await res.json();

        // SUCCESS
        if (res.ok && data.success) {
            alert("Registration Successful!");
            showLogin();
            return;
        }

        // VALIDATION ERRORS (express-validator)
        if (data.errors && data.errors.length > 0) {
            alert(data.errors[0].msg);
            return;
        }

        // OTHER BACKEND ERRORS
        alert(data.message || "Registration failed");

    } catch (err) {
        console.error("REGISTER ERROR:", err);
        alert("Server not responding. Check backend.");
    }
}



/* ===================================================
   LOGIN USER (JWT AUTH)
=================================================== */

async function loginUser() {

    const loginData = {
        email: document.getElementById("l_email").value.trim(),
        password: document.getElementById("l_password").value
    };

    try {
        const res = await fetch(API_URL + "/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loginData)
        });

        const data = await res.json();

        if (data.success && data.token) {

            alert("Login Successful");

            saveToken(data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            // Redirect based on role
            if (data.user.role === "customer") {
                window.location.href = "dashboard-user.html";
            } else {
                window.location.href = "dashboard-provider.html";
            }

        } else {
            alert(data.message || "Invalid login credentials");
        }

    } catch (err) {
        console.error(err);
        alert("Server connection error");
    }
}


/* ===================================================
   CHECK AUTH (PROTECT DASHBOARD)
=================================================== */

function checkAuth() {
    const token = getToken();

    if (!token) {
        if (!window.location.href.includes("login.html") &&
            !window.location.href.includes("index.html")) {
            window.location.href = "login.html";
        }
    }
}

window.addEventListener("DOMContentLoaded", checkAuth);


/* ===================================================
   LOAD BOOKINGS (CUSTOMER DASHBOARD)
=================================================== */

async function loadBookings() {

    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(API_URL + "/bookings", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        const data = await res.json();

        const container = document.getElementById("bookings-container");
        if (!container) return;

        if (data.success && data.bookings.length > 0) {

            let html = "";

            data.bookings.forEach(b => {

                html += `
                <div class="provider-card">
                    <div>
                        <p><strong>Service:</strong> ${b.service}</p>
                        <p><strong>Provider:</strong> ${b.provider}</p>
                        <p><strong>Date:</strong> ${b.booking_date}</p>
                        <p><strong>Status:</strong> ${b.status}</p>
                    </div>

                    <div>
                        ${b.status !== "Completed" && b.status !== "Cancelled"
                        ? `<button onclick="cancelBooking(${b.id})">Cancel</button>`
                        : ""}
                    </div>
                </div>
                `;
            });

            container.innerHTML = html;

        } else {
            container.innerHTML = "<p>No bookings yet.</p>";
        }

    } catch (err) {
        console.error(err);
    }
}


/* ===================================================
   CREATE BOOKING
=================================================== */

async function createBooking() {

    const token = getToken();
    if (!token) {
        alert("Please login first");
        return;
    }

    const bookingData = {
        customer_name: document.getElementById("customer_name").value,
        service: document.getElementById("service").value,
        provider: document.getElementById("provider").value,
        booking_date: document.getElementById("booking_date").value,
        booking_time: document.getElementById("booking_time").value,
        address: document.getElementById("address").value,
        notes: document.getElementById("notes").value
    };

    try {
        const res = await fetch(API_URL + "/booking", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(bookingData)
        });

        const data = await res.json();

        if (data.success) {
            alert("Booking Confirmed!");
            loadBookings();
        } else {
            alert(data.message || "Booking failed");
        }

    } catch (err) {
        console.error(err);
        alert("Server error");
    }
}


/* ===================================================
   CANCEL BOOKING
=================================================== */

async function cancelBooking(id) {

    if (!confirm("Cancel this booking?")) return;

    const token = getToken();

    try {
        const res = await fetch(API_URL + "/booking/" + id, {
            method: "DELETE",
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        const data = await res.json();

        if (data.success) {
            alert("Booking cancelled");
            loadBookings();
        } else {
            alert(data.message);
        }

    } catch (err) {
        console.error(err);
    }
}


/* ===================================================
   LOGOUT
=================================================== */

function logout() {
    clearAuthData();
    window.location.href = "login.html";
}


/* ===================================================
   AUTO LOAD BOOKINGS WHEN DASHBOARD OPENS
=================================================== */

window.addEventListener("DOMContentLoaded", loadBookings);
function bookService(service, provider) {

    // Scroll to booking form (if exists)
    const form = document.querySelector(".booking-form");
    if (form) {
        form.scrollIntoView({ behavior: "smooth" });
    }

    // Fill booking fields automatically
    const serviceInput = document.getElementById("service");
    const providerInput = document.getElementById("provider");

    if (serviceInput) serviceInput.value = service;
    if (providerInput) providerInput.value = provider;
}
