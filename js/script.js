// Login form handler: connects frontend to backend API
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            fetch('http://localhost:3000/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('Login successful!');
                    // Save token, redirect, etc.
                } else {
                    alert(data.message || 'Login failed');
                }
            })
            .catch(err => {
                alert('Error connecting to server');
                console.error(err);
            });
        });
    }
});
const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://servicesphere-production.up.railway.app";


/* ===================================================
   UTILITY FUNCTIONS
=================================================== */

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.display = "block";
    }
}

function hideError(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = "none";
        element.textContent = "";
    }
}

function showLoading(elementId, show = true) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = show ? "block" : "none";
    }
}

function showSuccess(elementId, message, show = true) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.display = show ? "block" : "none";
    }
}

// Get stored token
function getToken() {
    return localStorage.getItem("authToken");
}

// Save token
function saveToken(token) {
    localStorage.setItem("authToken", token);
}

// Clear token
function clearAuthData() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
}

/* ===================================================
   FORM VALIDATION
=================================================== */

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateRegisterForm() {
    let isValid = true;

    // Clear previous errors
    ["r_name", "r_email", "r_password", "r_confirm_password", "r_phone"].forEach(id => hideError(id + "_error"));

    const name = document.getElementById("r_name").value.trim();
    const email = document.getElementById("r_email").value.trim();
    const password = document.getElementById("r_password").value;
    const confirmPassword = document.getElementById("r_confirm_password").value;
    const phone = document.getElementById("r_phone").value.trim();

    if (!name) {
        showError("r_name_error", "Name is required");
        isValid = false;
    }

    if (!email) {
        showError("r_email_error", "Email is required");
        isValid = false;
    } else if (!validateEmail(email)) {
        showError("r_email_error", "Invalid email format");
        isValid = false;
    }

    if (!password) {
        showError("r_password_error", "Password is required");
        isValid = false;
    } else if (password.length < 6) {
        showError("r_password_error", "Password must be at least 6 characters");
        isValid = false;
    }

    if (!confirmPassword) {
        showError("r_confirm_password_error", "Please confirm your password");
        isValid = false;
    } else if (password !== confirmPassword) {
        showError("r_confirm_password_error", "Passwords do not match");
        isValid = false;
    }

    if (!phone) {
        showError("r_phone_error", "Phone number is required");
        isValid = false;
    }

    return isValid;
}

function validateLoginForm() {
    let isValid = true;

    hideError("l_email_error");
    hideError("l_password_error");

    const email = document.getElementById("l_email").value.trim();
    const password = document.getElementById("l_password").value;

    if (!email) {
        showError("l_email_error", "Email is required");
        isValid = false;
    } else if (!validateEmail(email)) {
        showError("l_email_error", "Invalid email format");
        isValid = false;
    }

    if (!password) {
        showError("l_password_error", "Password is required");
        isValid = false;
    }

    return isValid;
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
    if (!validateRegisterForm()) {
        return;
    }

    const userData = {
        name: document.getElementById("r_name").value.trim(),
        email: document.getElementById("r_email").value.trim(),
        password: document.getElementById("r_password").value,
        phone: document.getElementById("r_phone").value.trim(),
        role: document.getElementById("r_role").value
    };

    hideError("register_error");
    showSuccess("register_success", "", false);
    showLoading("register_loading", true);

    try {
        const response = await fetch(API_URL + "/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();
        showLoading("register_loading", false);

        if (data.success) {
            showSuccess("register_success", "Registration successful! Logging in...");
            
            // Clear form
            document.getElementById("registerForm").querySelector("form")?.reset();
            document.getElementById("r_name").value = "";
            document.getElementById("r_email").value = "";
            document.getElementById("r_password").value = "";
            document.getElementById("r_confirm_password").value = "";
            document.getElementById("r_phone").value = "";

            // Auto-login after 2 seconds
            setTimeout(() => {
                document.getElementById("l_email").value = userData.email;
                document.getElementById("l_password").value = userData.password;
                showLogin();
            }, 1000);
        } else {
            const errorMsg = data.message || data.errors?.[0]?.msg || "Registration failed";
            showError("register_error", errorMsg);
        }
    } catch (err) {
        showLoading("register_loading", false);
        console.error(err);
        showError("register_error", "Server not responding. Please try again.");
    }
}

/* ===================================================
   LOGIN USER
=================================================== */

async function loginUser() {
    if (!validateLoginForm()) {
        return;
    }

    const loginData = {
        email: document.getElementById("l_email").value.trim(),
        password: document.getElementById("l_password").value
    };

    hideError("login_error");
    showSuccess("login_success", "", false);
    showLoading("login_loading", true);

    try {
        const response = await fetch(API_URL + "/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();
        showLoading("login_loading", false);

        if (data.success && data.token) {
            showSuccess("login_success", "Login successful!");
            
            // Store token and user data
            saveToken(data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            // Redirect based on role
            setTimeout(() => {
                if (data.user.role === "customer") {
                    window.location.href = "dashboard-user.html";
                } else {
                    window.location.href = "dashboard-provider.html";
                }
            }, 1000);
        } else {
            const errorMsg = data.message || "Invalid email or password";
            showError("login_error", errorMsg);
        }
    } catch (err) {
        showLoading("login_loading", false);
        console.error(err);
        showError("login_error", "Server not responding. Please try again.");
    }
}

/* ===================================================
   LOAD AND DISPLAY BOOKINGS (CUSTOMER DASHBOARD)
=================================================== */

async function loadBookings() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(API_URL + "/bookings", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        const data = await response.json();

        const container = document.getElementById("bookings-container");
        if (!container) return;

        if (data.success && data.bookings && data.bookings.length > 0) {
            let html = `
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <thead>
                        <tr style="background: #f0f0f0; border-bottom: 2px solid #ddd;">
                            <th style="padding: 12px; text-align: left;">Service</th>
                            <th style="padding: 12px; text-align: left;">Provider</th>
                            <th style="padding: 12px; text-align: left;">Date</th>
                            <th style="padding: 12px; text-align: left;">Time</th>
                            <th style="padding: 12px; text-align: left;">Status</th>
                            <th style="padding: 12px; text-align: left;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.bookings.forEach(booking => {
                const statusColor = booking.status === "Completed" ? "green" : 
                                   booking.status === "Accepted" ? "blue" : 
                                   booking.status === "Cancelled" ? "red" : "orange";
                
                html += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 12px;">${booking.service}</td>
                        <td style="padding: 12px;">${booking.provider}</td>
                        <td style="padding: 12px;">${booking.booking_date}</td>
                        <td style="padding: 12px;">${booking.booking_time}</td>
                        <td style="padding: 12px; color: ${statusColor}; font-weight: bold;">${booking.status}</td>
                        <td style="padding: 12px;">
                            <button onclick="viewBookingDetails(${booking.id})" style="padding: 6px 10px; margin-right: 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">View</button>
                            ${booking.status !== "Completed" && booking.status !== "Cancelled" ? 
                                `<button onclick="cancelBooking(${booking.id})" style="padding: 6px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>` 
                                : ''}
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="text-align: center; color: #666;">No bookings yet. Book a service now!</p>';
        }
    } catch (err) {
        console.error(err);
        const container = document.getElementById("bookings-container");
        if (container) {
            container.innerHTML = '<p style="text-align: center; color: red;">Failed to load bookings</p>';
        }
    }
}

/* ===================================================
   BOOK SERVICE (populate form when "Book Now" clicked)
=================================================== */

function bookService(service, provider) {
    // Scroll to booking form
    const bookingForm = document.querySelector(".booking-form");
    if (bookingForm) {
        bookingForm.scrollIntoView({ behavior: "smooth" });
    }
    
    // Pre-fill the form
    document.getElementById("service").value = service;
    document.getElementById("provider").value = provider;
}

/* ===================================================
   VIEW BOOKING DETAILS
=================================================== */

function viewBookingDetails(bookingId) {
    const token = getToken();
    if (!token) {
        alert("Please login first");
        return;
    }

    fetch(API_URL + "/bookings", {
        method: "GET",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const booking = data.bookings.find(b => b.id == bookingId);
            if (booking) {
                alert(
                    `Booking Details:\n\n` +
                    `Service: ${booking.service}\n` +
                    `Provider: ${booking.provider}\n` +
                    `Date: ${booking.booking_date}\n` +
                    `Time: ${booking.booking_time}\n` +
                    `Address: ${booking.address}\n` +
                    `Status: ${booking.status}\n` +
                    `Notes: ${booking.notes || 'None'}`
                );
            }
        }
    })
    .catch(err => console.error(err));
}

/* ===================================================
   CANCEL BOOKING
=================================================== */

async function cancelBooking(bookingId) {
    if (!confirm("Are you sure you want to cancel this booking?")) {
        return;
    }

    const token = getToken();
    if (!token) {
        alert("Please login first");
        return;
    }

    try {
        const response = await fetch(API_URL + "/booking/" + bookingId, {
            method: "DELETE",
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        const data = await response.json();

        if (data.success) {
            alert("Booking cancelled successfully!");
            loadBookings(); // Reload bookings
        } else {
            alert(data.message || "Failed to cancel booking");
        }
    } catch (err) {
        console.error(err);
        alert("Server error. Please try again.");
    }
}

async function createBooking() {
    const token = getToken();
    if (!token) {
        alert("Please login first");
        window.location.href = "login.html";
        return;
    }

    const bookingData = {
        customer_name: document.getElementById("customer_name")?.value,
        service: document.getElementById("service")?.value,
        provider: document.getElementById("provider")?.value,
        booking_date: document.getElementById("booking_date")?.value,
        booking_time: document.getElementById("booking_time")?.value,
        address: document.getElementById("address")?.value,
        notes: document.getElementById("notes")?.value || ""
    };

    // Validate booking data
    if (!bookingData.customer_name || !bookingData.service || !bookingData.provider || 
        !bookingData.booking_date || !bookingData.booking_time || !bookingData.address) {
        alert("Please fill in all required fields");
        return;
    }

    try {
        const response = await fetch(API_URL + "/booking", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify(bookingData)
        });

        const data = await response.json();

        if (data.success) {
            alert("Booking confirmed!");
            // Clear form
            document.getElementById("customer_name").value = "";
            document.getElementById("service").value = "";
            document.getElementById("provider").value = "";
            document.getElementById("booking_date").value = "";
            document.getElementById("booking_time").value = "";
            document.getElementById("address").value = "";
            document.getElementById("notes").value = "";
            loadBookings(); // Reload bookings
        } else {
            alert(data.message || "Booking failed");
        }
    } catch (err) {
        console.error(err);
        alert("Server error. Please try again.");
    }
}

/* ===================================================
   LOGOUT
=================================================== */

function logout() {
    const confirmLogout = confirm("Are you sure you want to logout?");
    if (confirmLogout) {
        clearAuthData();
        window.location.href = "login.html";
    }
}

/* ===================================================
   CHECK AUTHENTICATION
=================================================== */

function checkAuth() {
    const token = getToken();
    if (!token) {
        // Redirect to login if not authenticated
        if (!window.location.href.includes("login.html") && 
            !window.location.href.includes("index.html")) {
            window.location.href = "login.html";
        }
    }
}

// Check auth on page load
window.addEventListener("DOMContentLoaded", checkAuth);


function loadBookings() {

  fetch("http://localhost:3000/bookings")
    .then(res => res.json())
    .then(bookings => {

      const container = document.getElementById("bookingContainer");
      container.innerHTML = "";

      bookings.forEach(b => {

        container.innerHTML += `
          <div class="provider-card">
            <div>
              <p><strong>Customer:</strong> ${b.customer_name}</p>
              <p><strong>Service:</strong> ${b.service}</p>
              <p><strong>Date:</strong> ${b.booking_date}</p>
              <p><strong>Status:</strong> ${b.status}</p>
            </div>

            <div>
              <button onclick="updateStatus(${b.id}, 'Accepted')">
                Accept
              </button>
              <button onclick="updateStatus(${b.id}, 'Rejected')">
                Reject
              </button>
            </div>
          </div>
        `;
      });
    });
}

function updateStatus(id, status) {

  fetch("http://localhost:3000/updateBooking", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id, status })
  })
  .then(res => res.text())
  .then(msg => {
      alert(msg);
      loadBookings();
  });
}

window.addEventListener("DOMContentLoaded", loadBookings);

